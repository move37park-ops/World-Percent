import React, { useRef } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Animated } from 'react-native';
import { Market } from '../services/api';

interface MarketItemProps {
    market: Market;
    onPress: (market: Market) => void;
}

export const MarketItem: React.FC<MarketItemProps> = ({ market, onPress }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.98,
            useNativeDriver: true,
            speed: 50,
            bounciness: 0,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 50,
            bounciness: 0,
        }).start();
    };

    const lines = market.title.split('\n');
    const koreanTitleRaw = lines[0];
    const englishTitle = lines[1] || '';

    // Split Korean title into main and paren
    const korParts = koreanTitleRaw.split('(');
    const mainKor = korParts[0].trimEnd();
    const parenKor = korParts[1] ? '(' + korParts[1] : '';

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
                style={styles.container}
                activeOpacity={0.7}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={() => onPress(market)}
            >
                <View style={styles.contentContainer}>
                    <View style={styles.titleContainer}>
                        <Text style={styles.titleKor}>
                            {mainKor}
                            {parenKor ? `\n${parenKor}` : ''}
                        </Text>
                        {englishTitle ? <Text style={styles.titleEng}>{englishTitle}</Text> : null}
                    </View>
                    <Text style={styles.arrow}>→</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(0, 0, 0, 0.4)', // Semi-transparent
        paddingVertical: 20,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)', // Glass border
        borderRadius: 0,
        marginBottom: 12,
    },
    contentContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    titleContainer: {
        flex: 1,
        marginRight: 10,
    },
    titleKor: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'Pretendard-Bold',
        lineHeight: 26,
        letterSpacing: -0.3,
    },
    titleEng: {
        color: '#888888',
        fontSize: 14,
        fontFamily: 'Pretendard-Regular',
        lineHeight: 20,
        letterSpacing: -0.2,
        marginTop: 4,
    },
    arrow: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'Pretendard-Regular',
        opacity: 0.4,
    },
});


