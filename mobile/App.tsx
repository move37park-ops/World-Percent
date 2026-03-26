import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FlatList, ScrollView, RefreshControl, Text, StyleSheet, View, TouchableOpacity, Dimensions, Animated, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { MainLayout } from './src/components/MainLayout';
import { fetchMarkets, Market } from './src/services/api';

SplashScreen.preventAutoHideAsync();

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type Category = 'macro' | 'stock' | 'crypto';

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

  // A separate component to handle real-time price updates and flash animations
  const LiveOutcomeRow = ({ outcome, initialPrice }: { outcome: string, initialPrice: string }) => {
    const prevPriceRef = useRef(initialPrice);
    const [displayPrice, setDisplayPrice] = useState(initialPrice);
    const flashAnim = useRef(new Animated.Value(0)).current;
    const [flashType, setFlashType] = useState<'up' | 'down'>('up');

    useEffect(() => {
      if (initialPrice !== prevPriceRef.current) {
        const newP = parseFloat(initialPrice);
        const oldP = parseFloat(prevPriceRef.current);
        if (newP > oldP) setFlashType('up');
        else if (newP < oldP) setFlashType('down');
        setDisplayPrice(initialPrice);
        prevPriceRef.current = initialPrice;

        flashAnim.setValue(1);
        Animated.timing(flashAnim, { toValue: 0, duration: 600, useNativeDriver: false }).start();
      }
    }, [initialPrice]);

    const formatProbability = (pStr: string) => {
      const p = parseFloat(pStr);
      if (isNaN(p)) return '0%';
      return (p * 100).toFixed(0) + '%';
    };

    const flashColor = flashAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#FFFFFF', flashType === 'up' ? '#00FF88' : '#FFB000']
    });

    return (
      <View style={styles.detailOutcomeRow}>
        <Text style={styles.detailOutcomeText} numberOfLines={2}>{outcome}</Text>
        <Animated.Text style={[styles.detailPriceText, { color: flashColor }]}>
          {formatProbability(displayPrice)}
        </Animated.Text>
      </View>
    );
  };

  // Real-time prices: map from submarket id -> yes price string
  const [livePriceMap, setLivePriceMap] = useState<Record<string, string>>({});

  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(15));
  const [bgFade] = useState(new Animated.Value(0.8));

  const wsRef = useRef<WebSocket | null>(null);
  const flatListRef = useRef<any>(null);
  const selectedIndexRef = useRef<number>(-1); // track tapped item index for scroll restoration

  const fadeIn = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(15);
    bgFade.setValue(0.8);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 12 }),
      Animated.timing(bgFade, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    fadeIn();
  }, [selectedCategory, selectedMarket]);

  // Handle WebSocket Connection whenever a market is selected
  useEffect(() => {
    if (!selectedMarket) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setLivePriceMap({});
      return;
    }

    // Seed initial prices from DB data
    const initialMap: Record<string, string> = {};
    selectedMarket.markets.forEach(sub => {
      let prices: string[] = [];
      try { prices = Array.isArray(sub.outcomePrices) ? sub.outcomePrices : JSON.parse(sub.outcomePrices || '[]'); } catch(e){}
      if (prices[0]) initialMap[sub.id] = prices[0];
    });
    setLivePriceMap(initialMap);

    const marketIds = selectedMarket.markets.map(m => m.id);
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isActive = true;
    let backoffDelay = 1000;

    const connectWS = () => {
      if (!isActive) return;
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

      // Correct Polymarket CLOB WebSocket endpoint
      const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
      wsRef.current = ws;

      ws.onopen = () => {
        backoffDelay = 1000;
        ws.send(JSON.stringify({ assets_ids: marketIds, type: 'market' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            const updates: Record<string, string> = {};
            data.forEach((msg: any) => {
              // Each message has asset_id (submarket ID) and price (Yes price)
              if (msg.asset_id && msg.price && marketIds.includes(msg.asset_id)) {
                updates[msg.asset_id] = msg.price;
              }
            });
            if (Object.keys(updates).length > 0) {
              setLivePriceMap(prev => ({ ...prev, ...updates }));
            }
          }
        } catch (e) {
          console.error('WS Parse Error', e);
        }
      };

      ws.onerror = (e) => console.log('WS Error', e);
      ws.onclose = () => {
        if (isActive) {
          reconnectTimer = setTimeout(connectWS, backoffDelay);
          backoffDelay = Math.min(backoffDelay * 1.5, 15000);
        }
      };
    };

    connectWS();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') connectWS();
      else if (nextAppState === 'background') wsRef.current?.close();
    });

    return () => {
      isActive = false;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      appStateSubscription.remove();
    };
  }, [selectedMarket]);

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          'Pretendard-Black': require('./assets/fonts/Pretendard-Black.otf'),
          'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.otf'),
          'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
          'Pretendard-Regular': require('./assets/fonts/Pretendard-Regular.otf'),
        });
      } catch (e) {} finally {
        setFontsLoaded(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  const loadMarkets = async (category: Category) => {
    setLoading(true);
    const data = await fetchMarkets(category);
    setMarkets(data);
    setLoading(false);
  };

  const onRefresh = async () => {
    if (selectedCategory) {
      setRefreshing(true);
      await loadMarkets(selectedCategory);
      setRefreshing(false);
    }
  };

  const handleSelectCategory = (category: Category) => {
    setSelectedCategory(category);
    selectedIndexRef.current = -1; // Reset scroll index when changing category
    loadMarkets(category);
  };

  const handleBack = () => {
    if (selectedMarket) setSelectedMarket(null);
    else { setSelectedCategory(null); setMarkets([]); }
  };

  if (!fontsLoaded) return null;

    const renderContent = () => {
        if (!selectedCategory) {
          return (
            <>
              <View style={styles.headerContainer}>
                <Text style={styles.appTitle}>WORLD TERMINAL</Text>
                <Text style={styles.appSubtitle}>BEYOND PROBABILITY • REALTIME INSIGHTS</Text>
              </View>
              <View style={styles.categoryContainer}>
                <TouchableOpacity style={styles.categoryCard} activeOpacity={0.8} onPress={() => handleSelectCategory('macro')}>
                  <View style={styles.cardHeader}><Text style={styles.categoryTitle}>거시경제 / MACRO</Text><Text style={styles.arrow}>→</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.categoryCard} activeOpacity={0.8} onPress={() => handleSelectCategory('stock')}>
                  <View style={styles.cardHeader}><Text style={styles.categoryTitle}>주식 / STOCK</Text><Text style={styles.arrow}>→</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.categoryCard} activeOpacity={0.8} onPress={() => handleSelectCategory('crypto')}>
                  <View style={styles.cardHeader}><Text style={styles.categoryTitle}>가상자산 / CRYPTO</Text><Text style={styles.arrow}>→</Text></View>
                </TouchableOpacity>
              </View>
            </>
          );
        }
        return (
          <View style={{ flex: 1 }}>
            {/* --- LIST VIEW --- */}
            <View style={{ flex: 1, display: selectedMarket ? 'none' : 'flex' }}>
              <View style={styles.navHeader}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}><Text style={styles.backText}>← Back to List</Text></TouchableOpacity>
              </View>
              
              <Text style={styles.sectionTitle}>
                {selectedCategory === 'macro' ? '거시경제 / MACRO' : selectedCategory === 'stock' ? '주식 / STOCK' : '가상자산 / CRYPTO'}
              </Text>

              <FlatList
                ref={flatListRef}
                data={markets}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedMarket(item)}>
                        <View style={styles.glassContainerCard}>
                            <Text style={styles.cardCategoryLabel}>{item.category || 'GENERAL'}</Text>
                            <Text style={styles.cardTitle}>{item.title}</Text>
                            {item.originalTitle ? <Text style={styles.cardTitleEng}>{item.originalTitle}</Text> : null}
                            <View style={styles.cardFooter}>
                                <Text style={styles.cardVolume}>VOL: ${item.volume.toLocaleString()}</Text>
                                <Text style={styles.cardArrow}>DETAILS →</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                )}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>{loading ? 'LOADING WORLD TERMINAL...' : 'NO ACTIVE MARKETS DETECTED'}</Text>
                  </View>
                }
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            </View>

            {/* --- DETAIL VIEW --- */}
            {selectedMarket && (
              <View style={{ flex: 1 }}>
                <View style={styles.navHeader}>
                  <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <Text style={styles.backText}>← Back to List</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.detailTitleContainer}>
                  <Text style={styles.detailTitleKor}>
                    {selectedMarket!.title.split('\n')[0].split('(')[0].trimEnd()}
                    {selectedMarket!.title.split('\n')[0].includes('(') && (
                      <Text style={styles.detailTitleParen}>
                        {'\n(' + selectedMarket!.title.split('\n')[0].split('(')[1]}
                      </Text>
                    )}
                  </Text>
                  {selectedMarket!.originalTitle ? (
                    <Text style={styles.detailTitleEng}>
                      {selectedMarket!.originalTitle}
                    </Text>
                  ) : null}
                  <Text style={styles.detailVolume}>
                    VOLUME: ${selectedMarket!.volume?.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.glassContainer}>
                  <ScrollView 
                    style={styles.outcomesListWrapper} 
                    contentContainerStyle={styles.outcomesList}
                    showsVerticalScrollIndicator={false}
                  >
                    {selectedMarket!.markets.map((subMarket, mIdx) => {
                      let outcomes: string[] = [];
                      if (Array.isArray(subMarket.outcomes)) outcomes = subMarket.outcomes;
                      else { try { outcomes = JSON.parse(subMarket.outcomes || '[]'); } catch(e){} }

                      let prices: string[] = [];
                      if (Array.isArray(subMarket.outcomePrices)) prices = subMarket.outcomePrices;
                      else { try { prices = JSON.parse(subMarket.outcomePrices || '[]'); } catch(e){} }

                      const isBinary = outcomes.length === 2 && 
                        ['yes', '예'].includes((outcomes[0] || '').toLowerCase());

                      if (isBinary) {
                        const label = subMarket.question || `Option ${mIdx + 1}`;
                        const livePrice = livePriceMap[subMarket.id] || prices[0] || '0';
                        return (
                          <LiveOutcomeRow key={subMarket.id || mIdx} outcome={label} initialPrice={livePrice} />
                        );
                      } else {
                        return outcomes.map((outcome, oIdx) => (
                          <LiveOutcomeRow key={`${subMarket.id}-${oIdx}`} outcome={outcome} initialPrice={prices[oIdx] || '0'} />
                        ));
                      }
                    })}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        );
      };
    
      return (
        <SafeAreaProvider onLayout={onLayoutRootView}>
          <MainLayout bgStyle={{ opacity: bgFade }}>
            <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              {renderContent()}
            </Animated.View>
          </MainLayout>
        </SafeAreaProvider>
      );
    }
    
    const styles = StyleSheet.create({
      headerContainer: { marginTop: SCREEN_HEIGHT * 0.08, marginBottom: SCREEN_HEIGHT * 0.06, paddingHorizontal: 10 },
      appTitle: { color: '#FFFFFF', fontSize: 38, fontFamily: 'Pretendard-Bold', letterSpacing: -1, marginBottom: 8 },
      appSubtitle: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 11, fontFamily: 'Pretendard-Medium', letterSpacing: 3 },
      categoryContainer: { flex: 1, justifyContent: 'flex-start', gap: 20 },
      categoryCard: { backgroundColor: 'rgba(255, 255, 255, 0.03)', paddingVertical: SCREEN_HEIGHT * 0.045, paddingHorizontal: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
      cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      categoryTitle: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Pretendard-Bold', letterSpacing: 1 },
      arrow: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Pretendard-Regular', opacity: 0.6 },
      navHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingVertical: 10 },
      backButton: { paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.03)' },
      backText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Pretendard-Bold', letterSpacing: 2, textTransform: 'uppercase' },
      sectionTitle: { color: '#FFFFFF', fontSize: 28, fontFamily: 'Pretendard-Bold', letterSpacing: -0.5, marginBottom: 20, paddingHorizontal: 10 },
      listContent: { paddingBottom: 60, gap: 16 },
      glassContainerCard: { backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
      cardCategoryLabel: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 10, fontFamily: 'Pretendard-Bold', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },
      cardTitle: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Pretendard-Bold', lineHeight: 26 },
      cardTitleEng: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 13, fontFamily: 'Pretendard-Medium', lineHeight: 18, marginTop: 6 },
      cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
      cardVolume: { color: 'rgba(255, 255, 255, 0.3)', fontSize: 10, fontFamily: 'Pretendard-Medium', letterSpacing: 1 },
      cardArrow: { color: 'rgba(255, 255, 255, 0.3)', fontSize: 10, fontFamily: 'Pretendard-Bold', letterSpacing: 1 },
      emptyContainer: { padding: 60, alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }, 
      emptyText: { color: 'rgba(255, 255, 255, 0.3)', fontSize: 12, fontFamily: 'Pretendard-Medium', letterSpacing: 2 },
      detailContainer: { marginTop: 10 }, 
      glassContainer: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 0 },
      detailTitleContainer: { marginTop: 16, marginBottom: 24, paddingHorizontal: 4 },
      detailTitleKor: { color: '#FFFFFF', fontSize: 26, fontFamily: 'Pretendard-Bold', lineHeight: 34, marginBottom: 12 },
      detailTitleParen: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Pretendard-Medium' },
      detailTitleEng: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 15, fontFamily: 'Pretendard-Medium', lineHeight: 22, marginTop: -4, marginBottom: 12 },
      detailVolume: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 13, fontFamily: 'Pretendard-Medium', textTransform: 'uppercase', letterSpacing: 1 },
      outcomesListWrapper: { flex: 1 },
      outcomesList: { paddingBottom: 30 },
      detailOutcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
      detailOutcomeText: { flex: 1, color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, fontFamily: 'Pretendard-Medium', paddingRight: 16, lineHeight: 20 },
      detailPriceText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Pretendard-Bold', minWidth: 48, textAlign: 'right' }
    });

