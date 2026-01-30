import {Image, Text, View} from "react-native";
import {Gesture, GestureDetector} from "react-native-gesture-handler";
import Svg, {Path} from "react-native-svg";
import React, {useState} from "react";
import useColors from "../../hooks/useColors";
import {runOnJS} from "react-native-reanimated";
import {useAppContext} from "../../contexts/AppContext";
import FontText from "../general/FontText";

export function PuttingGreen({
                                 holedOut = false,
                                 setHoledOut,
                                 updateField,
                                 largeMiss,
                                 setLargeMiss,
                                 width: realWidth,
                                 height,
                                 point,
                                 center,
                                 setWidth: setWidthProp,
                                 setHeight: setHeightProp,
                                 setPoint,
                                 setCenter
                             }) {
    const colors = useColors();
    const {userData} = useAppContext();
    const [ballSize, setBallSize] = useState(0);
    const [width, setWidth] = useState(0);

    const difference = (width - height) / 2;

    const update = (key, value) => {
        if (updateField) {
            updateField(key, value);
        } else {
            switch (key) {
                case "width":
                    setWidthProp?.(value);
                    break;
                case "height":
                    setHeightProp?.(value);
                    break;
                case "point":
                    setPoint?.(value);
                    break;
                case "center":
                    setCenter?.(value);
                    break;
                case "holedOut":
                    setHoledOut?.(value);
                    break;
                default:
                    console.warn("Unknown update key:", key);
            }
        }
    };

    const onLayout = (event) => {
        const {width: rawWidth, height: rawHeight} = event.nativeEvent.layout;

        setWidth(rawWidth);
        update("height", rawHeight);
        update("width", rawHeight);
    };

    const singleTap = userData.preferences.units === 0 ? Gesture.Tap()
        .onStart((data) => {
            if (largeMiss && largeMiss.distance !== -1) {
                runOnJS(setLargeMiss)({
                    distance: -1,
                    dir: ""
                });
                return;
            }
            if (holedOut) {
                runOnJS(update)("holedOut", false);

                return;
            }
            // ignore it if the point is outside of the green
            if (data.x - difference < 0 || data.x - difference > height || data.y < 0 || data.y > height) return;

            runOnJS(update)("center", data.x > width / 2 - 25 && data.x < width / 2 + 25 && data.y > height / 2 - 25 && data.y < height / 2 + 25);

            const boxWidth = height / 10;
            const boxHeight = height / 10;

            // Assuming tap data comes in as `data.x` and `data.y`
            const snappedX = Math.round((data.x - difference) / boxWidth) * boxWidth;
            const snappedY = Math.round(data.y / boxHeight) * boxHeight;

            runOnJS(update)("point", {x: snappedX, y: snappedY});
            console.log("Tapped at:", data.x, data.y, "Snapped to:", snappedX, snappedY);
        }) : Gesture.Tap()
        .onStart((data) => {
            if (largeMiss && largeMiss.distance !== -1) {
                runOnJS(setLargeMiss)({
                    distance: -1,
                    dir: ""
                });
                return;
            }
            if (holedOut) {
                runOnJS(update)("holedOut", false);

                return;
            }
            runOnJS(update)("center", data.x > width / 2 - 25 && data.x < width / 2 + 25 && data.y > height / 2 - 25 && data.y < height / 2 + 25);
            if (data.x - difference < 0 || data.x - difference > height || data.y < 0 || data.y > height) return;

            const boxWidth = height / 8;
            const boxHeight = height / 8; // this works, DO NOT TOUCH IT, I HAVE NO CLUE WHY THIS WORKS

            // Assuming tap data comes in as `data.x` and `data.y`
            const snappedX = Math.round((data.x - difference) / boxWidth) * boxWidth;
            const snappedY = Math.round(data.y / boxHeight) * boxHeight;

            runOnJS(update)("point", {x: snappedX, y: snappedY}); // again, this works, DO NOT TOUCH IT, I HAVE NO CLUE WHY THIS WORKS
        });

    return (
        <View style={{flex: updateField ? 1 : 0, maxHeight: width}}>
            <View style={{
                alignSelf: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                width: height
            }}>
                {userData.preferences.units === 0 ? (
                    <>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>5ft</FontText>
                        <Text></Text>
                        <Text></Text>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>1ft</FontText>
                        <Text></Text>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>0ft</FontText>
                        <Text></Text>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>1ft</FontText>
                        <Text></Text>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>2ft</FontText>
                        <Text></Text>
                    </>
                ) : (
                    <>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>1m</FontText>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>1/2m</FontText>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>0m</FontText>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>1/2m</FontText>
                        <FontText style={{fontSize: 14, fontWeight: 500, color: colors.putting.grid.text}}>1m</FontText>
                    </>
                )}
            </View>
            <GestureDetector gesture={singleTap}>
                <View onLayout={onLayout}
                      style={{
                          alignSelf: "center",
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "col",
                          flex: updateField ? 1 : 0,
                          aspectRatio: updateField ? "auto" : 1,
                          width: "100%",
                      }}>
                    {((largeMiss && largeMiss.distance !== -1) || holedOut) && (
                        <View style={{
                            position: 'absolute',
                            top: 0,
                            left: '50%',
                            transform: [{ translateX: -height / 2 }],
                            backgroundColor: 'rgba(255, 255, 255, 0.75)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            zIndex: 99,
                            borderRadius: 12,
                            aspectRatio: 1,
                            width: height
                        }}>
                            <FontText style={{ fontSize: 18, fontWeight: '700', color: '#333' }}>
                                {holedOut ? "You holed out" : "Miss logged as >3ft"}
                            </FontText>
                            <FontText style={{ fontSize: 14, color: '#555' }}>
                                No need to mark your putt
                            </FontText>
                            <FontText style={{ fontSize: 14, color: '#555' }}>
                                If you want to override that, tap on grid.
                            </FontText>
                        </View>
                    )}
                    <Image
                        source={userData.preferences.units === 0 ? require('@/assets/images/putting-grid.png') : require('@/assets/images/putting-grid-metric.png')}
                        style={{
                            borderWidth: 1,
                            borderRadius: 12,
                            borderColor: colors.putting.grid.border,
                            aspectRatio: 1,
                            flex: 1,
                            maxHeight: width
                        }}/>
                    <Image style={{position: "absolute", height: width / 10 + 1, width: width / 10 + 1,}} source={require("../../assets/images/golf-hole-borderless.png")}></Image>
                    { center &&
                        <View style={{
                            justifyContent: "center",
                            alignItems: "center",
                            position: "absolute",
                            left: width / 2 - (width / 20),
                            top: height / 2 - (width / 20),
                            width: width / 10 + 1,
                            height: width / 10 + 1,
                            borderRadius: 24,
                            backgroundColor: colors.checkmark.background
                        }}>
                            <Svg width={24} height={24}
                                 stroke={colors.checkmark.color}
                                 xmlns="http://www.w3.org/2000/svg" fill="none"
                                 viewBox="0 0 24 24" strokeWidth="3">
                                <Path strokeLinecap="round" strokeLinejoin="round"
                                      d="m4.5 12.75 6 6 9-13.5"/>
                            </Svg>
                        </View>
                    }
                    {point.x !== undefined && center !== true ? (
                        <Image source={require('@/assets/images/golf-ball.png')} onLayout={(event) => setBallSize(event.nativeEvent.layout.width)} style={{
                            position: "absolute",
                            left: point.x - (ballSize/2) + difference,
                            top: point.y - (ballSize/2),
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: "#fff"
                        }}></Image>
                    ) : null}
                </View>
            </GestureDetector>
        </View>
    );
}