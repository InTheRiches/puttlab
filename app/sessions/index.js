import {FlatList, Pressable, View} from "react-native";
import useColors from "../../hooks/useColors";
import {useLocalSearchParams, useNavigation} from "expo-router";
import Svg, {Path} from "react-native-svg";
import React from "react";
import {Session} from "../../components/sessions";
import {SecondaryButton} from "../../components/general/buttons/SecondaryButton";
import FontText from "../../components/general/FontText";
import ScreenWrapper from "../../components/general/ScreenWrapper";

export default function Sessions({}) {
    const colors = useColors();
    const navigation = useNavigation();

    const { puttSessionsString, userId, name } = useLocalSearchParams();
    const puttSessions = JSON.parse(puttSessionsString);

    const renderItem = ({ item, index }) => (
        <Session key={"session_" + index} session={item} userId={userId} />
    );

    return (
        <ScreenWrapper style={{justifyContent: "flex-start"}}>
            <View>
                <View style={{flexDirection: "row", alignItems: "center", marginBottom: 12}}>
                    <FontText style={{textAlign: "left", marginLeft: 64, width: "100%", color: colors.text.primary, fontSize: 22, fontWeight: 600, flex: 1}}>{name === undefined ? "Your" : name + "'s"} Sessions</FontText>
                    <Pressable onPress={navigation.goBack} style={{position: "absolute", left: 0, marginLeft: 14, padding: 10}}>
                        <Svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.5}
                             stroke={colors.text.primary} width={24} height={24}>
                            <Path strokeLinecap="round" strokeLinejoin="round"
                                  d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"/>
                        </Svg>
                    </Pressable>
                </View>
                <View style={{flexDirection: "row", borderBottomWidth: 1, borderColor: colors.border.default, paddingLeft: 12, paddingVertical: 10, borderTopWidth: 1}}>
                    <FontText style={{color: colors.text.secondary, fontSize: 16, flex: 0.5, textAlign: "left"}}>Type</FontText>
                    <FontText style={{color: colors.text.secondary, fontSize: 16, flex: 1, textAlign: "center"}}>Date</FontText>
                    <FontText style={{color: colors.text.secondary, fontSize: 16, flex: 0.7, textAlign: "center"}}>Holes</FontText>
                    <FontText style={{color: colors.text.secondary, fontSize: 16, flex: 0.7, textAlign: "center"}}>Putts</FontText>
                    <FontText style={{color: colors.text.secondary, fontSize: 16, flex: 0.7, textAlign: "center"}}>SG</FontText>
                </View>
            </View>
            <FlatList
                data={puttSessions}
                contentContainerStyle={{paddingBottom: 90}}
                renderItem={renderItem}
                keyExtractor={(item, index) => "session_" + index}
            />
            <View style={{position: "absolute", bottom: 0, width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 24}}>
                <SecondaryButton onPress={() => {
                    navigation.goBack();
                }} title={"Back"} style={{paddingVertical: 10, borderRadius: 10, flex: 1}}></SecondaryButton>
            </View>
        </ScreenWrapper>
    )
}