import useColors from "../../../../hooks/useColors";
import {Dimensions, ScrollView, View} from "react-native";
import React, {useEffect, useMemo} from "react";
import {SGByBreakSlope, SGByDistanceChart} from "./graphs";
import {Toggleable} from "../../../general/buttons/Toggleable";
import FontText from "../../../general/FontText";
import SGOverTime from "./graphs/SGOverTime";
import {roundTo} from "../../../../utils/roundTo";

export const StrokesGainedTab = ({statsToUse, byMonthStats, showDifference = false, previousStats}) => {
    const colors = useColors();
    const {width} = Dimensions.get("screen")
    const [graph, setGraph] = React.useState(0);

    const [showOverTime, setShowOverTime] = React.useState(false);

    useEffect(() => {
        let count = 0;
        for (let i = 0; i < Object.keys(byMonthStats).length; i++) {
            const month = Object.keys(byMonthStats)[i];
            const stats = byMonthStats[month];
            if (stats.strokesGained.expectedStrokes > 0) count++;
        }

        if (count > 1) {
            setShowOverTime(true);
        }
    }, [byMonthStats]);

    let difference = 0;

    // if (previousStats !== undefined && previousStats.length > 0 && showDifference)
    //     difference = statsToUse.strokesGained.overall - previousStats[previousStats.length-1].strokesGained.overall;

    const sgByDistance = useMemo(() => {
        return (
            <>
                <FontText style={{marginTop: 12, fontWeight: 600, fontSize: 16, width: "100%"}}>Strokes Gained By Distance</FontText>

                <View style={{alignItems: "center"}}>
                    <SGByDistanceChart statsToUse={statsToUse}/>
                </View>
                <View style={{flexDirection: "row", width: "100%", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 24}}>
                    <View style={{backgroundColor: "#40C2FF", aspectRatio: 1, width: 14, borderRadius: 12}}></View>
                    <FontText style={{color: colors.text.primary}}>Your Averages</FontText>
                </View>
            </>
        )
    }, [statsToUse]);

    const sgByBreakSlope = useMemo(() => {
        return (
            <>
                <FontText style={{marginTop: 12, fontWeight: 600, fontSize: 16, width: "100%"}}>Strokes Gained By Break/Slope</FontText>
                <SGByBreakSlope statsToUse={statsToUse}></SGByBreakSlope>
            </>
        )
    }, [statsToUse]);

    return (
        <ScrollView contentContainerStyle={{paddingBottom: 0, alignItems: "center"}} showsVerticalScrollIndicator={false} bounces={false} style={{width: width, paddingHorizontal: 20}}>
            <FontText style={{ color: colors.text.secondary, fontSize: 14, fontWeight: 400, textAlign: "center" }}>Strokes Gained</FontText>
            <FontText style={{ color: colors.text.secondary, fontSize: 12, fontWeight: 800, marginTop: 2, textAlign: "center" }}>VS</FontText>
            <FontText style={{ color: colors.text.secondary, fontSize: 14, fontWeight: 400, textAlign: "center" }}>PGA Tour Pro</FontText>
            <View style={{flexDirection: "row", justifyContent: "center", alignItems: "center", width: "100%", gap: 6}}>
                <FontText style={{color: colors.text.primary, fontSize: 48, fontWeight: 600}}>{((statsToUse.strokesGained.expectedStrokes - statsToUse.totalPutts) / (statsToUse.holesPlayed / 18)) > 0 ? "+" : ""}{roundTo((statsToUse.strokesGained.expectedStrokes - statsToUse.totalPutts) / (statsToUse.holesPlayed / 18), 1)}</FontText>
                { previousStats !== undefined && previousStats.length > 0 && difference !== 0 &&
                    <View style={{backgroundColor: difference > 0 ? "#A1ECA8" : "#ffc3c3", alignItems: "center", justifyContent: "center", borderRadius: 32, paddingHorizontal: 10, paddingVertical: 4}}>
                        <FontText style={{color: difference > 0 ? "#275E2B" : "#a60303", fontSize: 14, fontWeight: 500}}>{difference > 0 ? `+ ${difference.toFixed(1)} SG` : `${difference.toFixed(1)} SG`}</FontText>
                    </View>
                }
            </View>
            <FontText style={{color: colors.text.secondary, fontSize: 14, fontWeight: 400, textAlign: "center"}}>(per 18 holes)</FontText>
            <View style={{flexDirection: "row", gap: 10, marginTop: 24, marginBottom: 16}}>
                <Toggleable toggled={graph === 0} onToggle={() => setGraph(0)} title={"Distance"}/>
                <Toggleable toggled={graph === 1} onToggle={() => setGraph(1)} title={"Direction"}/>
                {showOverTime && <Toggleable toggled={graph === 2} onToggle={() => setGraph(2)} title={"Time"}/>}
            </View>
            {graph === 0 && sgByDistance}
            {graph === 1 && sgByBreakSlope}
            {graph === 2 && (
                <>
                    <FontText style={{marginTop: 12, fontWeight: 600, fontSize: 16, width: "100%"}}>Strokes Gained Over Time</FontText>

                    <SGOverTime statsToUse={byMonthStats} months={12}></SGOverTime>
                </>
            )}

            <FontText style={{marginTop: 24, fontWeight: 700, fontSize: 16, marginBottom: 10}}>HOW TO READ THE DATA</FontText>
            <View>
                <View style={{flexDirection: "row", alignItems: "center", marginBottom: 2}}>
                    <View style={{width: 8, height: 8, borderRadius: 15, backgroundColor: "black", marginRight: 8}}></View>
                    <FontText style={{fontSize: 14, fontWeight: 500}}>Strokes Gained</FontText>
                </View>
                <FontText style={{marginLeft: 16, color: colors.text.secondary}}>The number of strokes gained or lost compared to the average PGA Tour player over 18 holes. A positive number means that you average less strokes than a pro. Positive is better than negative. The pill next to your current strokes gained shows an increase or decrease between the last 5 sessions and the current 5.</FontText>
            </View>
            <View style={{marginTop: 12, marginBottom: 24}}>
                <View style={{flexDirection: "row", alignItems: "center", marginBottom: 2}}>
                    <View style={{width: 8, height: 8, borderRadius: 15, backgroundColor: "black", marginRight: 8}}></View>
                    <FontText style={{fontSize: 14, fontWeight: 500}}>By Direction</FontText>
                </View>
                <FontText style={{marginLeft: 16, color: colors.text.secondary}}>Each vertex on the radar graph corresponds to a certain kind of break/slope. The closer the blue area is to the vertex, the better you putt with that break/slope. The closer you are to the center, the worse.</FontText>
            </View>
        </ScrollView>
    )
}