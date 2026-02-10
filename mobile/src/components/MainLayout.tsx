import React, { ReactNode } from 'react';
import { View, StyleSheet, StatusBar, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface MainLayoutProps {
    children: ReactNode;
    bgStyle?: any;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, bgStyle }) => {
    return (
        <View style={styles.container}>
            <Animated.Image
                source={require('../../assets/earth_bg.jpg')}
                style={[
                    styles.backgroundImage,
                    bgStyle // Now only the image breathes
                ]}
                resizeMode="cover"
            />
            <View style={styles.overlay}>
                <SafeAreaView style={styles.safeArea}>
                    <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
                    <View style={styles.content}>
                        {children}
                    </View>
                </SafeAreaView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    backgroundImage: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        top: '25%', // Maintain the lowered position
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
    },
});
