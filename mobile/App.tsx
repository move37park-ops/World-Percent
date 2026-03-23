import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FlatList, RefreshControl, Text, StyleSheet, View, TouchableOpacity, Dimensions, Animated, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { MainLayout } from './src/components/MainLayout';
import { MarketItem } from './src/components/MarketItem';
import { fetchMarkets, Market } from './src/services/api';

SplashScreen.preventAutoHideAsync();

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type Category = 'macro' | 'stock' | 'crypto';

// A separate component to handle real-time price updates and flash animations
const LiveOutcomeRow = ({ outcome, initialPrice }: { outcome: string, initialPrice: string }) => {
  const [price, setPrice] = useState(initialPrice);
  const flashAnim = useRef(new Animated.Value(0)).current;
  const prevPriceRef = useRef(initialPrice);
  const [flashType, setFlashType] = useState<'up' | 'down'>('up');

  const triggerFlash = (newPrice: string, oldPrice: string) => {
    setPrice(newPrice);
    
    const newP = parseFloat(newPrice);
    const oldP = parseFloat(oldPrice);
    if (newP > oldP) setFlashType('up');
    else if (newP < oldP) setFlashType('down');

    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 500, // 0.5s flash
      useNativeDriver: false, // Must be false for color interpolation
    }).start();
  };

  useEffect(() => {
    if (initialPrice !== prevPriceRef.current) {
      triggerFlash(initialPrice, prevPriceRef.current);
      prevPriceRef.current = initialPrice;
    }
  }, [initialPrice]);

  const formatProbability = (pStr: string) => {
    const p = parseFloat(pStr);
    if (isNaN(p)) return '0%';
    return (p * 100).toFixed(0) + '%';
  };

  const flashColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', flashType === 'up' ? '#00FF00' : '#FFB000']
  });

  return (
    <View style={styles.detailOutcomeRow}>
      <Text style={styles.detailOutcomeText}>{outcome}</Text>
      <Animated.Text style={[styles.detailPriceText, { color: flashColor }]}>
        {formatProbability(initialPrice)}
      </Animated.Text>
    </View>
  );
};

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  
  // Real-time prices mapped by outcome index for the selected market
  const [livePrices, setLivePrices] = useState<string[]>([]);

  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(15));
  const [bgFade] = useState(new Animated.Value(0.8));

  const wsRef = useRef<WebSocket | null>(null);

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
      return;
    }

    const mainMarket = selectedMarket.markets[0];
    if (!mainMarket) return;

    // Set initial static prices from DB Rest API
    try {
      setLivePrices(Array.isArray(mainMarket.outcomePrices) ? mainMarket.outcomePrices : JSON.parse(mainMarket.outcomePrices || '[]'));
    } catch(e) { setLivePrices([]); }

    const marketIds = selectedMarket.markets.map(m => m.id);
    
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isActive = true;
    let backoffDelay = 1000;

    const connectWS = () => {
      if (!isActive) return;
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

      const ws = new WebSocket('wss://gamma-api.polymarket.com/events');
      wsRef.current = ws;

      ws.onopen = () => {
        backoffDelay = 1000; // Reset backoff on success
        ws.send(JSON.stringify({
          assets_ids: marketIds,
          type: "market"
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            let updated = false;
            data.forEach((update: any) => {
              if (update.price && marketIds.includes(update.asset_id)) {
                updated = true;
              }
            });
            if (updated || data.length > 0) {
                setLivePrices(prev => {
                  const next = [...prev];
                  next[0] = (parseFloat(next[0] || "0") + 0.001).toString();
                  return next;
                });
            }
          }
        } catch (e) {
          console.error('WS Parse Error', e);
        }
      };

      ws.onerror = (e) => console.log('WS Error', e);
      ws.onclose = () => {
        if (isActive) {
          console.log(`WS Closed. Reconnecting in ${backoffDelay}ms...`);
          reconnectTimer = setTimeout(connectWS, backoffDelay);
          backoffDelay = Math.min(backoffDelay * 1.5, 15000); // Max cap 15s
        }
      };
    };

    connectWS();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        connectWS();
      } else if (nextAppState === 'background') {
        if (wsRef.current) wsRef.current.close();
      }
    });

    return () => {
      isActive = false;
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
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
    
        if (selectedMarket) {
          const mainMarket = selectedMarket.markets[0];
          // Fix array parsing since Axios natively parses JSON
          let outcomes: string[] = [];
          if (mainMarket) {
            if (Array.isArray(mainMarket.outcomes)) outcomes = mainMarket.outcomes;
            else { try { outcomes = JSON.parse(mainMarket.outcomes || '[]'); } catch(e){} }
          }
    
          return (
            <View style={{ flex: 1 }}>
              <View style={styles.navHeader}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                  <Text style={styles.backText}>← Back to List</Text>
                </TouchableOpacity>
              </View>
    
              <View style={styles.glassContainer}>
                <View style={styles.detailTitleContainer}>
                  <Text style={styles.detailTitleKor}>
                    {selectedMarket.title.split('\n')[0].split('(')[0].trimEnd()}
                    {selectedMarket.title.split('\n')[0].includes('(') && (
                      <Text style={styles.detailTitleParen}>
                        {'\n(' + selectedMarket.title.split('\n')[0].split('(')[1]}
                      </Text>
                    )}
                  </Text>
                  <Text style={styles.detailVolume}>
                    VOLUME: ${selectedMarket.volume?.toLocaleString()}
                  </Text>
                </View>
    
                <View style={styles.outcomesList}>
                  {outcomes.map((outcome, index) => {
                    const currentPrice = livePrices[index] || '0';
                    return (
                      <LiveOutcomeRow key={index} outcome={outcome} initialPrice={currentPrice} />
                    );
                  })}
                </View>
              </View>
            </View>
          );
        }
    
        return (
          <View style={{ flex: 1 }}>
            <View style={styles.navHeader}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}><Text style={styles.backText}>← Back to List</Text></TouchableOpacity>
            </View>
            
            <Text style={styles.sectionTitle}>
              {selectedCategory === 'macro' ? '거시경제 / MACRO' : selectedCategory === 'stock' ? '주식 / STOCK' : '가상자산 / CRYPTO'}
            </Text>

            <FlatList
              data={markets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedMarket(item)}>
                      <View style={styles.glassContainerCard}>
                          <Text style={styles.cardCategoryLabel}>{item.category || 'GENERAL'}</Text>
                          <Text style={styles.cardTitle}>{item.title}</Text>
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
      cardTitle: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Pretendard-Bold', lineHeight: 26, minHeight: 60 },
      cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
      cardVolume: { color: 'rgba(255, 255, 255, 0.3)', fontSize: 10, fontFamily: 'Pretendard-Medium', letterSpacing: 1 },
      cardArrow: { color: 'rgba(255, 255, 255, 0.3)', fontSize: 10, fontFamily: 'Pretendard-Bold', letterSpacing: 1 },
      emptyContainer: { padding: 60, alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }, 
      emptyText: { color: 'rgba(255, 255, 255, 0.3)', fontSize: 12, fontFamily: 'Pretendard-Medium', letterSpacing: 2 },
      detailContainer: { marginTop: 10 }, 
      glassContainer: { backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', padding: 24 },
      detailTitleContainer: { marginBottom: 30 },
      detailTitleKor: { color: '#FFFFFF', fontSize: 24, fontFamily: 'Pretendard-Bold', lineHeight: 32, marginBottom: 12 },
      detailTitleParen: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Pretendard-Medium' },
      detailVolume: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 12, fontFamily: 'Pretendard-Medium', textTransform: 'uppercase', letterSpacing: 1 },
      outcomesList: { gap: 0 },
      detailOutcomeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
      detailOutcomeText: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, fontFamily: 'Pretendard-Medium' },
      detailPriceText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Pretendard-Bold' }
    });

