import {Dimensions, FlatList, Platform, Pressable, View} from "react-native";
import useColors from "../../hooks/useColors";
import {useAppContext} from "../../contexts/AppContext";
import React, {useEffect, useMemo, useRef, useState} from "react";
import {Toggleable} from "../../components/general/buttons/Toggleable";
import {StrokesGainedTab} from "../../components/tabs/stats/sg";
import {OverviewTab} from "../../components/tabs/stats/overview";
import Svg, {Path} from "react-native-svg";
import {useNavigation, useRouter} from "expo-router";
import ScreenWrapper from "../../components/general/ScreenWrapper";
import Loading from "../../components/general/popups/Loading";
import FontText from "../../components/general/FontText";
import {PuttsAHoleTab} from "../../components/tabs/stats/putts";
import {MadePuttsTab} from "../../components/tabs/stats/made";
import {MisreadTab} from "../../components/tabs/stats/misreads/MisreadTab";
import MissBiasTab from "../../components/tabs/stats/missbias/MissBiasTab";
import deepAdd from "../../utils/DeepAdd";
import {createMonthAggregateStats} from "../../constants/Constants";
import {BannerAd, BannerAdSize, TestIds, useForeground} from "react-native-google-mobile-ads";

const bannerAdId = __DEV__ ? TestIds.BANNER : Platform.OS === "ios" ? "ca-app-pub-2701716227191721/1882654810" : "ca-app-pub-2701716227191721/3548415690";

export default function Stats({}) {
    const colors = useColors();
    const router = useRouter();
    const navigation = useNavigation();

    const bannerRef = useRef(null);
    useForeground(() => {
        bannerRef.current?.load();
    });

    const {
        byMonthStats,
        sessions,
        previousStats,
        putters,
        grips,
        nonPersistentData,
        userData
    } = useAppContext();
    const {width} = Dimensions.get("screen")

    const [tab, setTab] = useState(0);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const statsToUse = useMemo(() => {
        let combined = createMonthAggregateStats();
        if (nonPersistentData.filtering.putter !== 0) {
            const putterStats = putters[nonPersistentData.filtering.putter].stats;
            Object.keys(putterStats).forEach(m => {
                if (putterStats[m]) {
                    combined = deepAdd(combined, putterStats[m]);
                }
            });
        }
        if (nonPersistentData.filtering.grip !== 0) {
            const gripStats = grips[nonPersistentData.filtering.grip].stats;
            Object.keys(gripStats).forEach(m => {
                if (gripStats[m]) {
                    combined = deepAdd(combined, gripStats[m]);
                }
            });
        }
        if (nonPersistentData.filtering.grip === 0 && nonPersistentData.filtering.putter === 0) {
            Object.keys(byMonthStats).forEach(m => {
                if (byMonthStats[m]) {
                    combined = deepAdd(combined, byMonthStats[m]);
                }
            });
        }

        return combined;
    }, [byMonthStats, nonPersistentData.filtering.putter, putters, nonPersistentData.filtering.grip, grips]);
    const [isReady, setIsReady] = useState(false)

    const listRef = useRef(null);
    const scrollViewRef = useRef(null);

    useEffect(() => {
        navigation.addListener('transitionEnd', () => {
            setIsReady(true);
        });
    }, []);

    const tabs = [
        {
            id: 1,
            title: "Overview",
            content: useMemo(() => {
                return <OverviewTab statsToUse={statsToUse} previousStats={previousStats} sessions={sessions}
                                    userData={userData}/>
                // KEEP CURRENT STATS IN THE DEPS, OR ELSE WHEN UNITS CHANGE IT WILL NOT UPDATE
            }, [statsToUse, previousStats, sessions, userData])
        },
        {
            id: 2,
            title: "Strokes Gained",
            content: useMemo(() => {
                return <StrokesGainedTab statsToUse={statsToUse} byMonthStats={byMonthStats}
                                         previousStats={previousStats} showDifference={false}/>
            }, [statsToUse, byMonthStats, previousStats])
        },
        {
            id: 3,
            title: "Putts / Hole",
            content: useMemo(() => {
                return <PuttsAHoleTab statsToUse={statsToUse} previousStats={previousStats} showDifference={false}/>
            }, [statsToUse, previousStats])
        },
        {
            id: 4,
            title: "Made Putts",
            content: useMemo(() => {
                return <MadePuttsTab statsToUse={statsToUse} previousStats={previousStats} showDifference={false}/>
            }, [statsToUse, previousStats])
        },
        {
            id: 5,
            title: "Misreads",
            content: useMemo(() => {
                return <MisreadTab statsToUse={statsToUse}/>
            }, [statsToUse])
        },
        {
            id: 6,
            title: "Miss Bias",
            content: useMemo(() => {
                return <MissBiasTab statsToUse={statsToUse} previousStats={previousStats} showDifference={false}
                                    userData={userData}/>
            }, [statsToUse, previousStats, userData])
        }
    ]

    const scrollTo = async (i) => {
        listRef.current.scrollToIndex({index: i});
        setTab(i);
    }
    const handleScroll = (event) => {
        if (isUserScrolling) {
            setTab(Math.round(event.nativeEvent.contentOffset.x / width));
        }

        scrollViewRef.current.scrollToIndex({
            index: Math.round(event.nativeEvent.contentOffset.x / width),
            viewPosition: 0.5,
        });
    }

    if (!isReady)
        return <Loading/>

    return (
        <ScreenWrapper style={{borderBottomColor: colors.border.default, borderBottomWidth: 1}}>
            <View style={{paddingBottom: 8}}>
                <BannerAd ref={bannerRef} unitId={bannerAdId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
            </View>
            <View style={{flexDirection: "row", justifyContent: "space-between"}}>
                <FontText style={{
                    color: colors.text.primary,
                    fontSize: 24,
                    marginLeft: 24,
                    fontWeight: 600,
                    marginBottom: 12,
                    flex: 1
                }}>Stats</FontText>
                <Pressable
                    onPress={() => router.push('/settings/stats')}
                    style={{
                        backgroundColor: colors.text.primary,
                        borderRadius: 50,
                        padding: 6,
                        aspectRatio: 1,
                        position: "absolute",
                        right: 0,
                        marginRight: 24
                    }}
                >
                    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={colors.background.secondary} width={27} height={27}>
                        <Path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clipRule="evenodd" />
                    </Svg>
                </Pressable>
            </View>
            {(sessions.length === 0 || statsToUse.rounds < 1) ? (
                <View style={{
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.default,
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingHorizontal: 32
                }}>
                    <FontText style={{color: colors.text.primary, fontSize: 24, fontWeight: 600, textAlign: "center"}}>Not
                        enough data</FontText>
                    <FontText style={{color: colors.text.secondary, fontSize: 18, marginTop: 12, textAlign: "center"}}>Come
                        back when you have some
                        sessions {!(nonPersistentData.filtering.grip === 0 && nonPersistentData.filtering.putter === 0) ? "with that putter or grip" : ""} logged!</FontText>
                </View>
            ) : (
                <>
                    <FlatList
                        ref={scrollViewRef}
                        contentContainerStyle={{gap: 4, paddingHorizontal: 20}}
                        data={tabs}
                        horizontal={true}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({item, index}) =>
                            <Toggleable top={true} key={item.id} title={item.title} toggled={tab === index}
                                        onPress={() => {
                                            scrollTo(index);
                                        }}/>}
                    />
                    <FlatList
                        contentContainerStyle={{
                            flexGrow: 1,
                            marginTop: 24
                        }}
                        ref={listRef}
                        data={tabs}
                        onMomentumScrollEnd={() => setIsUserScrolling(false)}
                        onScroll={handleScroll}
                        horizontal={true}
                        onScrollBeginDrag={() => setIsUserScrolling(true)}
                        pagingEnabled={true}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({item}) => item.content}
                    />
                </>
            )
            }
        </ScreenWrapper>
    )
}