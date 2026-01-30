import {Dimensions, View} from "react-native";
import {RadarChart} from "../../";
import React from "react";
import {roundTo} from "../../../../../utils/roundTo";

export const BreakMisreadsByBreakSlope = ({statsToUse}) => {
    if (statsToUse === undefined || Object.keys(statsToUse).length === 0) {
        return <View></View>
    }

    return (
        <RadarChart graphSize={Dimensions.get("screen").width - 36}
                    scaleCount={4}
                    numberInterval={0}
                    data={[createMisreadsByBreak(statsToUse)]}
                    options={{
                        graphShape: 1,
                        showAxis: true,
                        showIndicator: true,
                        colorList: ["#24b2ff", "red"],
                        dotList: [false, true],
                    }}></RadarChart>
    )
}

function createMisreadsByBreak(currentStats) {
    // copy the object
    const mySlopes = JSON.parse(JSON.stringify(currentStats.misreadData.misreadLineBySlope));
    const myPutts = JSON.parse(JSON.stringify(currentStats.totalPuttsBySlope));

    let max = -999;

    // find the highest value, and take all of those out of that (as a percent)
    for (let slope of ["downhill", "neutral", "uphill"]) {
        for (let brek of ["leftToRight", "rightToLeft", "straight"]) {
            if (slope === "neutral" && brek === "straight")
                continue; // don't include neutral straight

            if (myPutts[slope][brek] === 0) {
                myPutts[slope][brek] = 1;
                continue;
            }

            if ((mySlopes[slope][brek] / myPutts[slope][brek])*100 > max) {
                max = (mySlopes[slope][brek] / myPutts[slope][brek])*100;
            }
        }
    }

    if (max === 0) {
        return {
            "Downhill\nStraight": [0.24, "12%"],
            "Downhill\nLeft to Right": [0.54, "27%"],
            "Neutral\nLeft to Right": [0.86, "43%"],
            "Uphill\nLeft to Right": [0.16, "8%"],
            "Uphill\nStraight": [0.04, "2%"],
            "Uphill\nRight to Left": [0.36, "18%"],
            "Neutral\nRight to Left": [0.76, "38%"],
            "Downhill\nRight to Left": [0.42, "21%"],
        };
    }

    max += 0.1;

    // make another copy of mySlopes
    const mySlopesCopy = JSON.parse(JSON.stringify(mySlopes));
    for (let slope of ["downhill", "neutral", "uphill"]) {
        for (let brek of ["leftToRight", "rightToLeft", "straight"]) {
            if (mySlopesCopy[slope][brek] === 0) {
                mySlopesCopy[slope][brek] = 0.03;
            }
            mySlopesCopy[slope][brek] = roundTo((mySlopesCopy[slope][brek] / myPutts[slope][brek]) / max, 2);
        }
    }

    return {
        "Downhill\nStraight": [mySlopesCopy.downhill.straight,  roundTo(mySlopes.downhill.straight*100, 0) + "%"],
        "Downhill\nLeft to Right": [mySlopesCopy.downhill.leftToRight, roundTo(mySlopes.downhill.leftToRight*100, 0) + "%"],
        "Neutral\nLeft to Right": [mySlopesCopy.neutral.leftToRight, roundTo(mySlopes.neutral.leftToRight*100, 0) + "%"],
        "Uphill\nLeft to Right": [mySlopesCopy.uphill.leftToRight, roundTo(mySlopes.uphill.leftToRight*100, 0) + "%"],
        "Uphill\nStraight": [mySlopesCopy.uphill.straight, roundTo(mySlopes.uphill.straight*100, 0) + "%"],
        "Uphill\nRight to Left": [mySlopesCopy.uphill.rightToLeft, roundTo(mySlopes.uphill.rightToLeft*100, 0) + "%"],
        "Neutral\nRight to Left": [mySlopesCopy.neutral.rightToLeft, roundTo(mySlopes.neutral.rightToLeft*100, 0) + "%"],
        "Downhill\nRight to Left": [mySlopesCopy.downhill.rightToLeft, roundTo(mySlopes.downhill.rightToLeft*100, 0) + "%"],
    }
}