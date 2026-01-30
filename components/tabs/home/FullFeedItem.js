import {Image, Pressable, Text, View} from "react-native";
import {BareScorecardCard, PuttScorecardCard} from "../../simulations/full/ScorecardCard";
import FontText from "../../general/FontText";
import {convertUnits} from "@/utils/Conversions";
import React from "react";
import useColors from "@/hooks/useColors";
import {useRouter} from "expo-router";
import {roundTo} from "@/utils/roundTo";

export function FullFeedItem({userData, item}) {
    const colors = useColors();
    const router = useRouter();

    return (
        <View style={{ borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 24, marginBottom: 24 }}>
            <Pressable onPress={() => {
                if (userData.uid === item.session.userId) {
                    router.push("/(tabs)/profile");
                } else {
                    router.push({pathname: "/user", params: {userId: item.user.id}})
                }
            }} style={{flexDirection: "row", alignItems: "center", marginBottom: 8}}>
                <View style={{flex: 1, flexDirection: "row", alignItems: "center"}}>
                    <View style={{ borderRadius: 50, backgroundColor: 'white', padding: 8 }}>
                        <Image source={require('../../../assets/branding/FlatstickMallet.png')} style={{ width: 40, height: 40 }} />
                    </View>
                    <View style={{marginLeft: 8, flex: 1, paddingRight: 2}}>
                        <Text style={{color: colors.text.primary, fontSize: 20, fontWeight: 500}}>{item.user.displayName}</Text>
                        <Text style={{ color: colors.text.secondary, fontSize: 15, marginTop: -4}}>At {item.specifics.score ? item.specifics.courseName : "Practice Putting Green"}</Text>
                    </View>
                </View>
                <Text style={{ color: colors.text.secondary, fontSize: 16}}>{new Date(item.session.date).toLocaleDateString()}</Text>
            </Pressable>
            <Pressable onPress={() => {
                router.push({pathname: (item.specifics.score ? "/sessions/individual/full" : "/sessions/individual"), params: {recap: false, userId: userData.uid === item.session.userId ? undefined : item.user.id, sessionId: item.session.id}});
            }}>
                {item.specifics.score ? <BareScorecardCard data={item.scorecard}/> : <PuttScorecardCard data={item.scorecard} front={true} totalPutts={item.stats.totalPutts} roundedTop={true} strokesGained={item.stats.strokesGained}/>}
                <View style={{backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: colors.border.default, borderBottomLeftRadius: 16, borderBottomRightRadius: 16}}>
                    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
                        <View style={{flexDirection: "column", flex: 0.6, borderRightWidth: 1, borderColor: colors.border.default, paddingBottom: 8, paddingTop: 6, paddingLeft: 12,}}>
                            <FontText style={{fontSize: 13, textAlign: "left", fontWeight: 700, color: colors.text.tertiary,}}>HOLES</FontText>
                            <FontText numberOfLines={1} ellipsizeMode="tail" style={{fontSize: 20, color: colors.text.primary, fontWeight: "bold", flexShrink: 1}}>{item.stats.holesPlayed}</FontText>
                        </View>
                        <View style={{flexDirection: "column", flex: 1, borderRightWidth: 1, borderColor: colors.border.default, paddingBottom: 8, paddingTop: 6, paddingLeft: 12,}}>
                            <FontText style={{fontSize: 13, textAlign: "left", fontWeight: 700, color: colors.text.tertiary,}}>1 PUTTS</FontText>
                            <FontText numberOfLines={1} ellipsizeMode="tail" style={{fontSize: 20, color: colors.text.primary, fontWeight: "bold", flexShrink: 1}}>{item.stats.puttCounts.onePutts}</FontText>
                        </View>
                        <View style={{flexDirection: "column", flex: 1, paddingBottom: 8, paddingTop: 6, paddingLeft: 12,}}>
                            <FontText style={{fontSize: 13, textAlign: "left", fontWeight: 700, color: colors.text.tertiary,}}>AVG DISTANCE</FontText>
                            <FontText numberOfLines={1} ellipsizeMode="tail" style={{fontSize: 20, color: colors.text.primary, fontWeight: "bold", flexShrink: 1}}>{roundTo(convertUnits(item.stats.avgDistance, item.session.units, userData.preferences.units), 1)}{userData.preferences.units === 0 ? "ft" : "m"}</FontText>
                        </View>
                    </View>
                    <View style={{ flexDirection: "row" }}>
                        <View style={{flexDirection: "column", flex: 0.6, borderRightWidth: 1, borderColor: colors.border.default, paddingBottom: 8, paddingTop: 6, paddingLeft: 12,}}>
                            <FontText style={{fontSize: 13, textAlign: "left", fontWeight: 700, color: colors.text.tertiary,}}>SG</FontText>
                            <FontText numberOfLines={1} ellipsizeMode="tail" style={{fontSize: 20, color: colors.text.primary, fontWeight: "bold", flexShrink: 1}}>{item.stats.strokesGained}</FontText>
                        </View>
                        <View style={{flexDirection: "column", flex: 1, borderRightWidth: 1, borderColor: colors.border.default, paddingBottom: 8, paddingTop: 6, paddingLeft: 12,}}>
                            <FontText style={{fontSize: 13, textAlign: "left", fontWeight: 700, color: colors.text.tertiary,}}>PUTTS</FontText>
                            <FontText numberOfLines={1} ellipsizeMode="tail" style={{fontSize: 20, color: colors.text.primary, fontWeight: "bold", flexShrink: 1}}>{item.stats.totalPutts}</FontText>
                        </View>
                        <View style={{flexDirection: "column", flex: 1, paddingBottom: 8, paddingTop: 6, paddingLeft: 12,}}>
                            <FontText style={{fontSize: 13, textAlign: "left", fontWeight: 700, color: colors.text.tertiary,}}>AVG MISS</FontText>
                            <FontText numberOfLines={1} ellipsizeMode="tail" style={{fontSize: 20, color: colors.text.primary, fontWeight: "bold", flexShrink: 1}}>{convertUnits(item.stats.avgMiss, item.session.units, userData.preferences.units)}{userData.preferences.units === 0 ? "ft" : "m"}</FontText>
                        </View>
                    </View>
                </View>
            </Pressable>
        </View>
    )
}