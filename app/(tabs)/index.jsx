import React, {useCallback, useRef, useState} from 'react';
import useColors from "@/hooks/useColors";
import {ActivityIndicator, FlatList, Platform, RefreshControl, Text, View} from "react-native";
import {BottomSheetModalProvider} from "@gorhom/bottom-sheet";
import ScreenWrapper from "@/components/general/ScreenWrapper";
import {BannerAd, BannerAdSize, TestIds, useForeground} from "react-native-google-mobile-ads";
import {collection, getDocs, limit, orderBy, query, startAfter} from "firebase/firestore";
import {auth, firestore} from "@/utils/firebase";
import {useAppContext} from "@/contexts/AppContext";
import {Header} from "@/components/tabs/Header";
import {FullFeedItem} from "@/components/tabs/home/FullFeedItem";
import {SimFeedItem} from "@/components/tabs/home/SimFeedItem";
import {useFocusEffect} from "expo-router";

const bannerAdId = __DEV__ ? TestIds.BANNER : Platform.OS === "ios" ? "ca-app-pub-2701716227191721/1882654810" : "ca-app-pub-2701716227191721/3548415690";
const PAGE_SIZE = 10;
const INTERVAL = 5; // show ad every 5 items

const getDataWithAds = (sessions) => {
    const output = [];
    sessions.forEach((session, index) => {
        output.push({ type: 'session', ...session });
        if ((index + 1) % INTERVAL === 0) {
            output.push({ type: 'ad', id: `ad-${index}` });
        }
    });
    return output;
};

// TODO add milestones/achievements to the homescreen items
export default function HomeScreen() {
    const colors = useColors();
    const {userData} = useAppContext();
    const [sessions, setSessions] = useState([]);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const bannerRef = useRef(null);

    useForeground(() => {
        bannerRef.current?.load();
    })

    const loadInitial = useCallback(async () => {
        setLoadingInitial(true);
        try {
            const feedQuery = query(
                collection(firestore, `userFeed/${auth.currentUser.uid}/feedItems`),
                orderBy('timestamp', 'desc'),
                limit(PAGE_SIZE)
            );
            const snapshot = await getDocs(feedQuery);
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setSessions(docs);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } catch (e) {
            console.error('Error loading userfeed:', e);
        }
        setLoadingInitial(false);
    }, [auth.currentUser]);

    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const feedQuery = query(
                collection(firestore, `userFeed/${auth.currentUser.uid}/feedItems`),
                orderBy('timestamp', 'desc'),
                startAfter(lastDoc),
                limit(PAGE_SIZE)
            );
            const snapshot = await getDocs(feedQuery);
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSessions(prev => [...prev, ...docs]);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
            if (snapshot.docs.length < PAGE_SIZE) setHasMore(false);
        } catch (e) {
            console.error('Error loading more userfeed:', e);
        }
        setLoadingMore(false);
    }, [auth.currentUser, lastDoc, loadingMore, hasMore]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadInitial();
        setTimeout(() => {
            setRefreshing(false);
        }, 1500);
    }, [loadInitial]);

    useFocusEffect(
        useCallback(() => {
            onRefresh();
        }, [])
    );

    const renderFooter = () => {
        if (!loadingMore && !hasMore) {
            return (
                <View style={{backgroundColor: colors.background.secondary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, paddingVertical: 12, borderRadius: 12}}>
                    <Text style={{color: colors.text.secondary, width: "100%", textAlign: "center", fontSize: 16, fontWeight: 500}}>No more activity, come back when you or your friends have posted more sessions!</Text>
                </View>
            )
        }
        if (!loadingMore) return null;
        return (
            <View style={{ padding: 16 }}>
                <ActivityIndicator size="small" />
            </View>
        );
    };

    const handleEndReached = () => {
        if (!loadingMore && hasMore) {
            loadMore();
        }
    };

    const renderItem = ({ item }) => {
        if (item.type === 'ad') {
            return (
                <View style={{ alignItems: 'center', marginVertical: 8 }}>
                    <BannerAd
                        unitId={bannerAdId}
                        size={BannerAdSize.MEDIUM_RECTANGLE}
                    />
                </View>
            );
        }
        if (item.session.type === "full" || item.session.type === "real") {
            return <FullFeedItem userData={userData} item={item} />;
        }
        else if (item.session.type === "sim") {
            return <SimFeedItem userData={userData} item={item} />;
        }
        else if (item.session.type === "green") {
            return <SimFeedItem userData={userData} item={item} />;
        }
    };

    return (
        <BottomSheetModalProvider>
            <ScreenWrapper>
                <View>
                    <BannerAd ref={bannerRef} unitId={bannerAdId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
                </View>
                <View style={{
                    flex: 1,
                    flexDirection: "column",
                    alignContent: "center",
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.default,
                    paddingHorizontal: 20,
                }}>
                    <FlatList
                        ListHeaderComponent={<Header bottomBorder={false}/>}
                        data={getDataWithAds(sessions)}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        onEndReached={handleEndReached}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={renderFooter}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{paddingBottom: 72}}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                        }
                    />
                </View>
            </ScreenWrapper>
        </BottomSheetModalProvider>
    );
}