import React, {useEffect, useRef, useState} from "react";
import {BackHandler, Platform, ScrollView, View} from "react-native";
import {useFocusEffect, useLocalSearchParams, useNavigation} from "expo-router";
import {AdEventType, InterstitialAd, TestIds} from "react-native-google-mobile-ads";
import Loading from "../../../components/general/popups/Loading";
import ScreenWrapper from "../../../components/general/ScreenWrapper";
import StrokesGainedSection from "../../../components/sessions/individual/new/StrokesGainedSection";
import PerformanceSection from "../../../components/sessions/individual/new/PerformanceSection";
import DistributionSection from "../../../components/sessions/individual/new/DistributionSection";
import BiasSection from "../../../components/sessions/individual/new/BiasSection";
import ActionButtons from "../../../components/sessions/individual/new/ActionButtons";
import Modals from "../../../components/sessions/individual/new/Modals";
import IndividualHeader from "../../../components/sessions/individual/new/IndividualHeader";
import {adaptOldSession} from "../../../services/userService";
import {useAppContext} from "../../../contexts/AppContext";
import {doc, getDoc} from "firebase/firestore";
import {auth, firestore} from "../../../utils/firebase";
import {PuttScorecardCard} from "../../../components/simulations/full/ScorecardCard";
import ScorecardHeader from "../../../components/sessions/individual/full/ScorecardHeader";

const adUnitId = __DEV__ ? TestIds.INTERSTITIAL : Platform.OS === "ios"
    ? "ca-app-pub-2701716227191721/6686596809"
    : "ca-app-pub-2701716227191721/8364755969";
const interstitial = InterstitialAd.createForAdRequest(adUnitId);

// adjust the distances for the distribution. I think 0.5 meters is not big enough. Maybe jump to 1?
// add the difficulty or mode to the info modal for simulations
// TODO not showing best session anymore, need to fix that (its set to false in the component below)
// TODO show if you earned an achievement here
export default function IndividualSession() {
    const navigation = useNavigation();
    const { jsonSession, recap, userId, sessionId } = useLocalSearchParams();
    const {userData} = useAppContext();

    const [session, setSession] = useState(jsonSession ? JSON.parse(jsonSession) : null);
    const [loading, setLoading] = useState(!jsonSession);

    // Fetch session if we don't already have it
    useEffect(() => {
        const fetchSession = async () => {
            if (session) return; // already have it from jsonSession
            if (!sessionId) {
                console.error("Missing sessionId to fetch session");
                return;
            }

            const usableUserId = userId === undefined ? auth.currentUser.uid : userId;

            try {
                const docRef = doc(firestore, `users/${usableUserId}/sessions`, sessionId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    let data = docSnap.data();
                    if (!data.schemaVersion || data.schemaVersion < 2) {
                        data = adaptOldSession(data);
                    }
                    setSession({ id: docSnap.id, ...data });
                } else {
                    console.warn("Session not found:", sessionId);
                }
            } catch (error) {
                console.error("Error fetching session:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSession();
    }, [sessionId, userId]);

    const isRecap = recap === "true";

    const shareSessionRef = useRef();
    const confirmDeleteRef = useRef();
    const infoModalRef = useRef();

    useFocusEffect(
        React.useCallback(() => {
            const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
                if (isRecap) interstitial.show();
            });

            if (isRecap) interstitial.load();

            const onBackPress = () => {
                if (!isRecap) navigation.goBack();
                return true;
            };

            const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);

            return () => {
                subscription.remove();
                unsubscribeLoaded();
            } // clean up when unfocused
        }, [navigation])
    );

    if (loading || !session || !userData) return <Loading />;

    const numOfHoles = session.meta === "green" ? session.stats.totalPutts : session.stats.holesPlayed;

    return loading ? <Loading /> : (
        <>
            <ScreenWrapper style={{ paddingHorizontal: 20, justifyContent: "space-between" }}>
                <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={{ marginBottom: 86 }}>
                        <IndividualHeader session={session} isRecap={isRecap} infoModalRef={infoModalRef} />
                        {session.meta.type === "real" && (
                            <ScorecardHeader session={session}/>
                        )}
                        {session && <PuttScorecardCard data={session.scorecard} front={true} roundedBottom={true} roundedTop={false} totalPutts={session.stats.totalPutts} strokesGained={session.stats.strokesGained}/>}
                        <View style={{flexDirection: "row"}}>
                            <StrokesGainedSection session={session}/>
                            <PerformanceSection session={session} numOfHoles={numOfHoles} preferences={userData.preferences} />
                        </View>

                        <DistributionSection session={session} numOfHoles={numOfHoles} preferences={userData.preferences} />
                        <BiasSection session={session} />
                    </View>
                </ScrollView>
                <ActionButtons
                    session={session}
                    isSelf={userId === undefined}
                    isRecap={isRecap}
                    setLoading={setLoading}
                    navigation={navigation}
                    shareSessionRef={shareSessionRef}
                    confirmDeleteRef={confirmDeleteRef}
                />
            </ScreenWrapper>
            <Modals
                session={session}
                shareSessionRef={shareSessionRef}
                confirmDeleteRef={confirmDeleteRef}
                infoModalRef={infoModalRef}
                isRecap={isRecap}
                navigation={navigation}
            />
        </>
    );
}
