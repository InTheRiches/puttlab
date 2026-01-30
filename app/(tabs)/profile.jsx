import React, {useMemo, useRef} from 'react';
import {ScrollView, View} from 'react-native';
import ScreenWrapper from '../../components/general/ScreenWrapper';
import {useAppContext} from '../../contexts/AppContext';
import ProfileHeader from '../../components/user/ProfileHeader';
import FriendsCard from '../../components/user/FriendsCard';
import StrokesGainedCard from '../../components/user/StrokesGainedCard';
import SessionsSection from '../../components/user/SessionsSection';
import StatsCard from "../../components/user/StatsCard";
import useColors from "../../hooks/useColors";
import {auth} from "../../utils/firebase";
import {useFocusEffect, useRouter} from "expo-router";
import {getFriends} from "../../services/friendServices";
import StrokesGainedModal from "../../components/user/StrokesGainedModal";
import {roundTo} from "../../utils/roundTo";
import {convertUnits} from "../../utils/Conversions";
import {createMonthAggregateStats} from "../../constants/Constants";
import deepAdd from "../../utils/DeepAdd";

export default function ProfileScreen() {
    const { userData, byMonthStats, sessions } = useAppContext();
    const colors = useColors();
    const router = useRouter();

    const strokesGainedRef = useRef(null);

    const [friends, setFriends] = React.useState([]);
    const statsToUse = useMemo(() => {
        let combined = createMonthAggregateStats();

        Object.keys(byMonthStats).forEach(m => {
            if (byMonthStats[m]) {
                combined = deepAdd(combined, byMonthStats[m]);
            }
        });

        return combined;
    }, [byMonthStats]);

    useFocusEffect(() => {
        getFriends(auth.currentUser.uid).then(setFriends);
    });

    const holesPlayed = statsToUse.holesPlayed === 0 ? 1 : statsToUse.holesPlayed;

    // console.log("strokes gained: " + (statsToUse.strokesGained.expectedStrokes - statsToUse.totalPutts) / (holesPlayed / 18));

    return (
        <ScreenWrapper style={{ paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                <ProfileHeader userData={userData} isSelf={true}/>
                <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
                    <FriendsCard alert={userData.hasPendingFriendRequests} friendCount={friends.length} isFriend={false} isSelf={true} />
                    <StrokesGainedCard strokesGainedRef={strokesGainedRef} value={roundTo((statsToUse.strokesGained.expectedStrokes - statsToUse.totalPutts) / (holesPlayed / 18), 1)} byMonthStats={byMonthStats} />
                </View>
                <SessionsSection sessions={sessions} isSelf={true}/>
                {/*<StatsCard title="ROUND STATS" stats={[{ label: 'AVG. SCORE', value: 77 }, { label: 'HANDICAP', value: 8.9 }]} />*/}
                <StatsCard title="PUTTING STATS" onPress={() => router.push({pathname: "/(tabs)/stats"})} stats={[{ label: 'AVG. PUTTS', value: roundTo(statsToUse.totalPutts/(holesPlayed/18), 1) }, { label: 'AVG. MISS', value: `${roundTo(convertUnits(statsToUse.missData.totalMissDistance/(statsToUse.missData.totalMissedPutts === 0 ? 1 : statsToUse.missData.totalMissedPutts), 0, userData.preferences.units), 1)}${userData.preferences.units === 0 ? "ft" : "m"}` }]} />
                <StatsCard title="COMPARE STATS" stats={[]} onPress={() => router.push({pathname: "/(tabs)/compare"})} />
                {/*<StatsCard title="ACHIEVEMENTS" stats={[]} onPress={() => router.push({pathname: "/achievements"})}/>*/}
            </ScrollView>
            <StrokesGainedModal byMonthStats={byMonthStats} strokesGainedRef={strokesGainedRef}/>
        </ScreenWrapper>
    );
}