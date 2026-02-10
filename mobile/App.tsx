import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, RefreshControl, Text, StyleSheet, View, TouchableOpacity, ScrollView, Platform, Dimensions, Animated } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { MainLayout } from './src/components/MainLayout';
import { MarketItem } from './src/components/MarketItem';
import { fetchMarkets, Market } from './src/services/api';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const GOLDEN_RATIO = 1.618;

type Category = 'macro' | 'stock' | 'crypto';

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(15));
  const [bgFade] = useState(new Animated.Value(0.8)); // Starts slightly dimmed

  const fadeIn = () => {
    // Content animation
    fadeAnim.setValue(0);
    slideAnim.setValue(15);

    // Background animation (natural, never disappears)
    bgFade.setValue(0.8);

    Animated.parallel([
      // Content (Snappy)
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 12,
      }),
      // Background (Subtle & Majestic)
      Animated.timing(bgFade, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    fadeIn();
  }, [selectedCategory, selectedMarket]);

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          'Pretendard-Black': require('./assets/fonts/Pretendard-Black.otf'),
          'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.otf'),
          'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
          'Pretendard-Regular': require('./assets/fonts/Pretendard-Regular.otf'),
        });
      } catch (e) {
        console.warn(e);
      } finally {
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
    if (selectedMarket) {
      setSelectedMarket(null);
    } else {
      setSelectedCategory(null);
      setMarkets([]);
    }
  };

  const handleSelectMarket = (market: Market) => {
    setSelectedMarket(market);
  };

  if (!fontsLoaded) {
    return null;
  }

  const renderContent = () => {
    if (!selectedCategory) {
      return (
        <>
          <View style={styles.headerContainer}>
            <Text style={styles.appTitle}>World Terminal</Text>
          </View>

          <View style={styles.categoryContainer}>
            <TouchableOpacity
              style={[styles.categoryCard, styles.macroCard]}
              activeOpacity={0.8}
              onPress={() => handleSelectCategory('macro')}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.categoryTitle}>거시경제 / MACRO</Text>
                <Text style={styles.arrow}>→</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryCard, styles.stockCard]}
              activeOpacity={0.8}
              onPress={() => handleSelectCategory('stock')}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.categoryTitle}>주식 / STOCK</Text>
                <Text style={styles.arrow}>→</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryCard, styles.cryptoCard]}
              activeOpacity={0.8}
              onPress={() => handleSelectCategory('crypto')}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.categoryTitle}>가상자산 / CRYPTO</Text>
                <Text style={styles.arrow}>→</Text>
              </View>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (selectedMarket) {
      const mainMarket = selectedMarket.markets[0];
      let outcomes: string[] = [];
      let prices: string[] = [];

      if (mainMarket) {
        outcomes = JSON.parse(mainMarket.outcomes);
        prices = JSON.parse(mainMarket.outcomePrices);
      }

      const formatProbability = (price: string) => {
        const p = parseFloat(price);
        return (p * 100).toFixed(0) + '%';
      };

      return (
        <View style={{ flex: 1 }}>
          <View style={styles.navHeader}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Text style={styles.backText}>← BACK</Text>
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.detailContainer}>
            <View style={styles.detailTitleContainer}>
              <Text style={styles.detailTitleKor}>
                {selectedMarket.title.split('\n')[0].split('(')[0].trimEnd()}
                {selectedMarket.title.split('\n')[0].includes('(') && (
                  <Text style={styles.detailTitleParen}>
                    {'\n(' + selectedMarket.title.split('\n')[0].split('(')[1]}
                  </Text>
                )}
              </Text>
              {selectedMarket.title.split('\n')[1] && (
                <Text style={styles.detailTitleEng}>{selectedMarket.title.split('\n')[1]}</Text>
              )}
            </View>

            <View style={styles.outcomesList}>
              {outcomes.map((outcome, index) => {
                const probability = formatProbability(prices[index] || '0');
                return (
                  <View key={index} style={styles.detailOutcomeRow}>
                    <Text style={styles.detailOutcomeText}>{outcome}</Text>
                    <Text style={styles.detailPriceText}>{probability}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.detailFooter}>
              <Text style={styles.detailVolume}>
                TOTAL VOLUME: ${selectedMarket.volume?.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.navHeader}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>← BACK</Text>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>
            {selectedCategory === 'macro' ? '거시경제 / MACRO' :
              selectedCategory === 'stock' ? '주식 / STOCK' :
                '가상자산 / CRYPTO'}
          </Text>
          <View style={{ width: 80 }} />
        </View>

        <FlatList
          data={markets}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MarketItem market={item} onPress={handleSelectMarket} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {loading ? 'Loading markets...' : 'No active markets found.'}
              </Text>
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
      <MainLayout bgStyle={{
        opacity: bgFade,
      }}>
        <Animated.View style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }}>
          {renderContent()}
        </Animated.View>
      </MainLayout>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // Header
  headerContainer: {
    marginTop: SCREEN_HEIGHT * 0.08, // Golden Ratio inspired positioning
    marginBottom: SCREEN_HEIGHT * 0.05,
    paddingHorizontal: 10,
  },
  appTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontFamily: 'Pretendard-Bold',
    letterSpacing: -1,
    marginBottom: 8,
  },
  appSubtitle: {
    color: '#888888',
    fontSize: 14,
    fontFamily: 'Pretendard-Medium',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: -4,
  },

  // Categories
  categoryContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 16,
  },
  categoryCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Semi-transparent
    paddingVertical: SCREEN_HEIGHT * 0.045,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)', // Glass border
    borderRadius: 0, // Perfect rectangles
  },
  macroCard: {
    borderColor: '#AAAAAA', // Much brighter
  },
  stockCard: {
    borderColor: '#777777', // Brighter
  },
  cryptoCard: {
    borderColor: '#555555', // Brighter
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Pretendard-Bold',
    letterSpacing: -0.5,
  },
  arrow: {
    color: '#FFFFFF', // Bright white for maximum visibility
    fontSize: 18,
    fontFamily: 'Pretendard-Regular',
    opacity: 0.6,
  },

  // Navigation
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#111111',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)', // Glass border
    borderRadius: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Semi-transparent
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Pretendard-Black',
    letterSpacing: 1,
  },
  sectionTitle: {
    color: '#FFFFFF', // Fully white for better visibility
    fontSize: 18,
    fontFamily: 'Pretendard-Bold', // Bolder weight back as requested
    letterSpacing: 0.8, // Tighter spacing maintained
  },

  // List
  listContent: {
    paddingBottom: 60,
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: '#444444',
    fontSize: 14,
    fontFamily: 'Pretendard-Regular',
  },

  // Detail View
  detailContainer: {
    marginTop: 20,
  },
  detailTitleContainer: {
    marginBottom: 40,
  },
  detailTitleKor: {
    color: '#FFFFFF',
    fontSize: 26,
    fontFamily: 'Pretendard-Bold',
    lineHeight: 34,
    marginBottom: 6,
  },
  detailTitleParen: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'Pretendard-Medium',
  },
  detailTitleEng: {
    color: '#888888',
    fontSize: 18,
    fontFamily: 'Pretendard-Regular',
    lineHeight: 24,
  },
  outcomesList: {
    gap: 0,
  },
  detailOutcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#111111',
  },
  detailOutcomeText: {
    color: '#888888',
    fontSize: 16,
    fontFamily: 'Pretendard-Regular',
  },
  detailPriceText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Pretendard-Bold',
  },
  detailFooter: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#111111',
  },
  detailVolume: {
    color: '#333333',
    fontSize: 10,
    fontFamily: 'Pretendard-Medium',
    letterSpacing: 2,
  },
});

