import {useFocusEffect, useLocalSearchParams, useRouter} from "expo-router";
import useColors from "../../../hooks/useColors";
import ScreenWrapper from "../../../components/general/ScreenWrapper";
import {ActivityIndicator, BackHandler, Platform, Pressable, Text, View} from "react-native";
import FontText from "../../../components/general/FontText";
import ElapsedTimeClock from "../../../components/simulations/ElapsedTimeClock";
import Svg, {Path} from "react-native-svg";
import React, {useEffect, useRef, useState} from "react";
import {ConfirmExit} from "../../../components/simulations/popups";
import {PrimaryButton} from "../../../components/general/buttons/PrimaryButton";
import {useAppContext} from "../../../contexts/AppContext";
import generatePushID from "../../../components/general/utils/GeneratePushID";
import {
    AdEventType,
    BannerAd,
    BannerAdSize,
    InterstitialAd,
    TestIds,
    useForeground
} from "react-native-google-mobile-ads";
import {NoPuttDataModal} from "../../../components/simulations/full/popups/NoPuttDataModal";
import {roundTo} from "../../../utils/roundTo";
import {newSession} from "../../../services/sessionService";
import {SCHEMA_VERSION} from "../../../constants/Constants";
import {auth, firestore} from "../../../utils/firebase";
import {
    fetchCourseElements,
    get3DEPElevationData,
    getOSMIdByLatLon,
    processCourseData
} from "../../../utils/courses/courseFetching";
import {doc, getDoc, setDoc} from "firebase/firestore";
import {getPolygonCentroid, isPointInPolygon} from "../../../utils/courses/polygonUtils";
import {calculateGPSPuttsOnlyStats} from "../../../utils/courses/gpsStatsEngine";
import {predictPutt} from "../../../utils/courses/predictionUtils";
import useUserLocation from "../../../hooks/useUserLocation";
import {GreenPolygon} from "../../../components/simulations/full/GreenPolygon";
import {viewBounds} from "../../../utils/courses/boundsUtils";
import {EditPuttModal} from "../../../components/simulations/full/popups/EditPuttModal";
import {PuttPredictionModal} from "../../../components/simulations/full/popups/PuttPredictionModal";
import AsyncStorage from "@react-native-async-storage/async-storage";

const adUnitId = __DEV__ ? TestIds.INTERSTITIAL : Platform.OS === "ios" ? "ca-app-pub-2701716227191721/6686596809" : "ca-app-pub-2701716227191721/1702380355";
const bannerAdId = __DEV__ ? TestIds.BANNER : Platform.OS === "ios" ? "ca-app-pub-2701716227191721/1687213691" : "ca-app-pub-2701716227191721/8611403632";
const interstitial = InterstitialAd.createForAdRequest(adUnitId);

// TODO when a person marks a holed out putt, it forces putts = 1, but when a person puts putts=1, it doesnt force the hole to be holed out
export default function PuttsOnlyRound() {
    const colors = useColors();
    const router = useRouter();
    const userLocation = useUserLocation();

    const {stringHoles, stringFront, stringCourse, stringCurrentHole, stringHoleHistory, stringTimeElapsed} = useLocalSearchParams();
    const {userData, grips, putters} = useAppContext();
    const confirmExitRef = useRef(null);
    const noPuttDataModalRef = useRef(null);
    const editPuttRef = useRef(null);
    const predictionRef = useRef(null);

    const holes = parseInt(stringHoles);
    const course = JSON.parse(stringCourse);
    const frontNine = stringFront === "true";

    const [hole, setHole] = useState(stringCurrentHole !== "" && stringCurrentHole !== undefined ? parseInt(stringCurrentHole) : (holes === 9 && !frontNine) ? 10 : 1); // Start at hole 10 if it's the back nine, otherwise start at hole 1
    const [startTime, setStartTime] = useState(new Date());
    const [holeStartTime, setHoleStartTime] = useState(stringTimeElapsed !== "" && stringTimeElapsed !== undefined ? new Date().getTime() - parseInt(stringTimeElapsed) : new Date().getTime());

    const [greens, setGreens] = useState({});
    const [allBunkers, setAllBunkers] = useState([]);
    const [holeBunkers, setHoleBunkers] = useState([]);
    const [fairways, setFairways] = useState([]);
    const [OSMCourseId, setOSMCourseId] = useState(null);
    const [roundData, setRoundData] = useState([]);
    const [pinLocation, setPinLocation] = useState(null);
    const [prediction, setPrediction] = useState(null);
    const [taps, setTaps] = useState([]);
    const [tapMode, setTapMode] = useState('pin');
    const [currentGreen, setCurrentGreen] = useState(null);
    const [holedOut, setHoledOut] = useState(false);

    const [adLoaded, setAdLoaded] = useState(false);
    const bannerRef = useRef(null);
    const saveTimeout = useRef(null);

    const saveRoundLocally = async () => {
        const timeElapsed = new Date().getTime() - startTime
        const holeTimeElapsed = new Date().getTime() - holeStartTime;

        const updatedRoundData = [...roundData];
        updatedRoundData[hole - 1] = {
            ...updatedRoundData[hole - 1],
            timeElapsed: holeTimeElapsed,
            hole,
            pinLocation,
            taps,
            holedOut
        };

        const roundDataToSerialize = {
            type: "real",
            timestamp: new Date().getTime(),
            stringHoles,
            stringFront,
            stringCourse,
            osmCourseID: OSMCourseId,
            holesPlayed: roundData.reduce((acc, hole) => hole.taps && (hole.taps.length || hole.holedOut) > 0 ? 1 + acc : acc, 0),
            timeElapsed,
            startedAt: startTime,
            currentHole: hole,
            holeHistory: JSON.stringify(updatedRoundData)
        }
        await AsyncStorage.setItem('currentRound', JSON.stringify(roundDataToSerialize))
            .catch((e) => {
                console.error(e);
            });

        console.log("Successfully saved round to AsyncStorage.")
    }

    useEffect(() => {
        if (((holes === 9 && hole === 9 && frontNine) || hole === 18)) return;
        if (saveTimeout.current) clearTimeout(saveTimeout.current);

        saveTimeout.current = setTimeout(async () => {
            saveRoundLocally();
        }, 1000); // adjust debounce window (ms) as needed

        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
        };
    }, [roundData, holedOut, taps, pinLocation]);

    useForeground(() => {
        bannerRef.current?.load();
    })

    useEffect(() => {
        // load OSM course data
        console.log("Starting fetch for course elements...");
        // check to see if it exists in our db first
        getOSMIdByLatLon(course.location.latitude, course.location.longitude).then((res) => {
            setOSMCourseId(res[0]?.id);
            if (!res || res.length === 0) {
                console.error("No OSM course found at this location.");
                alert("No course data found for this location. Please try again later or contact support.");
                router.replace("/");
                return;
            }
            const docRef = doc(firestore, "courses/" + res[0].id.toString());
            getDoc(docRef).then((document) => {
                if (!document.exists()) {
                    console.log("Course not found in Firestore, fetching from OSM...");
                    fetchCourseElements(res[0].id).then(async (newRes) => { //TODO will need to be fixed when implemented
                        const {identifiedGreens, rawFairways, rawBunkers} = processCourseData(newRes);

                        const processedGreens = [];

                        for (const green of identifiedGreens) {
                            const samples = await get3DEPElevationData(green.bbox);

                            if (!samples.length) {
                                console.warn("     No 3DEP samples returned.");
                                continue;
                            }

                            const lidarObject = [];
                            samples.forEach(s => {
                                lidarObject.push({
                                    location: {x: s.location.x, y: s.location.y},
                                    value: parseFloat(s.value).toFixed(4)
                                });
                            });

                            processedGreens.push({hole: green.hole, lidar: lidarObject, geojson: green.geojson});
                        }
                        // save to firestore for next time
                        await setDoc(doc(firestore, `courses/${res[0].id}`), {
                            name: course.course_name,
                            osm_id: res[0].id,
                            lastUpdated: Date.now(),
                            greens: processedGreens,
                            rawBunkers,
                            rawFairways
                        });

                        setGreens(processedGreens);
                        setFairways(rawFairways);
                        setAllBunkers(rawBunkers);
                        setHoleBunkers([]);

                        recalculateHoleBunkers(processedGreens, rawBunkers);

                        setStartTime(new Date());
                        setHoleStartTime(new Date().getTime());
                        for (const g of processedGreens) {
                            if (g.hole === hole.toString()) {
                                setCurrentGreen(g);
                                break;
                            }
                        }

                        resumeData();
                    }).catch((err) => {
                        console.error("Error fetching course data from OSM:", err);
                        alert("Failed to fetch course data. Please try again later or contact support.");
                        router.replace("/");
                    })
                    return;
                }
                const data = document.data();
                setGreens(data.greens);
                setFairways(data.rawFairways);
                setAllBunkers(data.rawBunkers);
                setHoleBunkers([]);

                recalculateHoleBunkers(data.greens, data.rawBunkers);

                setStartTime(new Date());
                setHoleStartTime(new Date().getTime());
                for (const g of data.greens) {
                    if (g.hole === hole.toString()) {
                        console.log("green: " + Object.keys(g.geojson))
                        setCurrentGreen(g);
                        break;
                    }
                }

                resumeData();
            }).catch((err) => {
                console.error("Error fetching course data from OSM:", err);
                alert("Failed to fetch course data. Please try again later or contact support.");
                router.replace("/practice");
            });
        })
    }, []);

    const resumeData = () => {
        console.log("Attempting to resume round data from parameters...");
        if (stringHoleHistory === undefined || stringCurrentHole === undefined || stringTimeElapsed === undefined) return;
        console.log("Resuming round data from parameters...");

        const holeData = JSON.parse(stringHoleHistory)[parseInt(stringCurrentHole) - 1];

        setStartTime(new Date(stringTimeElapsed !== "" && stringTimeElapsed !== undefined ? new Date().getTime() - parseInt(stringTimeElapsed) : new Date().getTime()));
        const holeTimeElapsed = holeData !== undefined && holeData.timeElapsed !== undefined ? holeData.timeElapsed : 0;
        setHoleStartTime(new Date().getTime() - holeTimeElapsed);

        setTaps(holeData !== undefined && holeData.taps !== undefined ? holeData.taps : []);
        setPinLocation(holeData !== undefined && holeData.pinLocation !== undefined ? holeData.pinLocation : null);
        setHoledOut(holeData !== undefined && holeData.holedOut !== undefined ? holeData.holedOut : false);
        setRoundData(JSON.parse(stringHoleHistory));
        console.log(stringHoleHistory);
    }

    useFocusEffect(
        React.useCallback(() => {
            const onBackPress = () => {
                confirmExitRef.current.present();
                console.log("still running")
                return true;
            };

            const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);

            return () => subscription.remove(); // clean up when unfocused
        }, [])
    );

    useEffect(() => {
        const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
            setAdLoaded(true);
        });

        interstitial.load();

        return () => {
            unsubscribeLoaded();
        }
    }, []);

    useEffect(() => {
        const loadPrediction = async () => {
            if (taps.length > 0 && pinLocation && currentGreen.lidar) {
                const prediction = await predictPutt(currentGreen.lidar, taps[taps.length - 1], pinLocation);
                setPrediction(prediction);
            }
            else {
                setPrediction(null);
            }
        }

        loadPrediction().catch(console.error);
    }, [taps, hole, pinLocation]);

    const saveHole = () => {
        const timeElapsed = new Date().getTime() - holeStartTime;

        const updatedRoundData = [...roundData];
        updatedRoundData[hole - 1] = {
            ...updatedRoundData[hole - 1],
            timeElapsed,
            hole,
            pinLocation,
            taps,
            holedOut
        };
        setRoundData(updatedRoundData);
    }

    const nextHole = () => {
        if ((holes === 9 && hole === 9 && frontNine) || hole === 18) {
            submit();
            return;
        }

        if (((holes === 18 && hole === 9) || (holes === 9 && hole === 4)) && adLoaded) {
            interstitial.show();
            setAdLoaded(false);
        }

        saveHole();

        if (roundData[hole] !== undefined) {
            setHoleStartTime(new Date().getTime() - roundData[hole].timeElapsed);
            setTaps(roundData[hole].taps);
            setPinLocation(roundData[hole].pinLocation);
            setHoledOut(roundData[hole].holedOut);
        } else {
            //reset data
            setHoleStartTime(new Date().getTime());
            setTaps([]);
            setPinLocation(null);
            setHoledOut(false);
        }
        for (const g of greens) {
            if (g.hole === (hole + 1).toString()) {
                setCurrentGreen(g);
                break;
            }
        }
        setTapMode("pin");
        recalculateHoleBunkers(greens, allBunkers, hole+1);
        setHole(hole + 1);
    }

    const recalculateHoleBunkers = (newGreens = greens, newBunkers = allBunkers, holeNum = hole) => {
        // *** NEW: Filter bunkers to find those close to the selected green ***
        let selectedGreenPolygon = null;
        for (const g of newGreens) {
            if (g.hole === holeNum.toString()) {
                selectedGreenPolygon = g;
                break;
            }
        }
        if (!selectedGreenPolygon) {
            setHoleBunkers([]); // No green, no bunkers
            return;
        }

        const greenCenter = getPolygonCentroid(selectedGreenPolygon.geojson.coordinates);
        // A threshold in degrees. 0.0004 degrees is roughly 45 meters.
        // This is a good distance to find bunkers around a green.
        const proximityThreshold = 0.0004;

        const nearbyBunkers = newBunkers.filter(bunkerPolygon => {
            //console.log("Bunker: " + JSON.stringify(bunkerPolygon));

            const bunkerCenter = getPolygonCentroid(bunkerPolygon.coordinates);
            // Using simple squared Euclidean distance for performance. It's accurate enough for small distances.
            const distSq =
                Math.pow(greenCenter.latitude - bunkerCenter.latitude, 2) +
                Math.pow(greenCenter.longitude - bunkerCenter.longitude, 2);
            return distSq < Math.pow(proximityThreshold, 2);
        });

        setHoleBunkers(nearbyBunkers);
    }

    const lastHole = () => {
        if (hole === 1 || (holes === 9 && !frontNine && hole === 10)) return;

        // save current hole
        saveHole();

        setHoleStartTime(new Date().getTime() - roundData[hole-2].timeElapsed);
        setTaps(roundData[hole-2].taps);
        setPinLocation(roundData[hole-2].pinLocation);
        setHoledOut(roundData[hole-2].holedOut);
        setTapMode("pin");
        for (const g of greens) {
            if (g.hole === (hole - 1).toString()) {
                setCurrentGreen(g);
                break;
            }
        }
        recalculateHoleBunkers(greens, allBunkers, hole - 1);
        setHole(hole - 1);
    }

    // TODO improve the stats for full rounds, like approach accuracy
    // TODO do we do all around strokes gained, along with putting strokes gained for this?
    const submit = () => {
        const timeElapsed = new Date().getTime() - holeStartTime;

        const updatedRoundData = [...roundData];
        updatedRoundData[hole - 1] = { // TODO HERE
            ...updatedRoundData[hole - 1],
            timeElapsed,
            hole,
            pinLocation,
            taps,
            holedOut
        };

        AsyncStorage.removeItem("currentRound");

        const {totalPutts, totalMisses, totalMadePutts, madePercent, strokesGained, leftRightBiasInches, shortPastBiasInches, puttCounts, totalDistanceFeet, holesPlayed, percentHigh, percentShort, missDistribution, avgMissFeet, detailedPutts} = calculateGPSPuttsOnlyStats(updatedRoundData, greens, userData.preferences.units);

        const scorecard = Array.from({ length: holesPlayed > 9 ? holes : 9 }, (_, i) => {
            const holeNumber = i + 1;
            const hole = detailedPutts.find(h => h.hole === holeNumber);
            return hole ? hole.totalPutts : -1;
        });

        const newData = {
            id: generatePushID(),
            meta: {
                schemaVersion: SCHEMA_VERSION,
                type: "real",
                date: startTime.toISOString(),
                durationMs: new Date().getTime() - startTime.getTime(),
                units: userData.preferences.units,
                synced: true, // TODO set this to false if not synced (if offline mode is ever added)
                courseID: course.id,
                osmCourseID: OSMCourseId,
                clubName: course.club_name,
                courseName: course.course_name,
                frontNine: frontNine
            },
            "player": {
                "putter": putters[userData.preferences.selectedPutter].type,
                "grip": grips[userData.preferences.selectedGrip].type
            },
            "stats": {
                "holes": holes,
                "holesPlayed": holesPlayed, // TODO this is holed putted, not just played, probably should rename or fix
                "totalPutts": totalPutts,
                "puttCounts": puttCounts,
                "madePercent": madePercent,
                "avgMiss": avgMissFeet,
                "strokesGained": roundTo(strokesGained, 1),
                "missData": missDistribution,
                "leftRightBias": leftRightBiasInches, // TODO consider moving this stuff to a separate "tendencies" object
                "shortPastBias": shortPastBiasInches,
                "totalDistance": totalDistanceFeet,
                "percentShort": percentShort,
                "percentHigh": percentHigh,
            },
            holeHistory: detailedPutts,
            scorecard,
        }

        newSession(auth.currentUser.uid, newData).then(() => {
            router.push({
                pathname: `/sessions/individual/full`,
                params: {
                    jsonSession: JSON.stringify(newData),
                    recap: "true"
                }
            });
        }).catch(error => {
            console.error("Error saving session:", error);
            alert("Failed to save session. Please try again later.");
        });
    };

    const fullReset = () => {
        AsyncStorage.removeItem("currentRound");
        router.replace("/(tabs)/practice");
    };

    const MemoizedGreenPolygon = React.useMemo(() => {
        return (
            <GreenPolygon
                greenCoords={currentGreen?.geojson.coordinates}
                bunkers={holeBunkers}
                fairways={fairways}
                taps={taps}
                setTaps={setTaps}
                onTap={(newTap) => {
                    if (tapMode === "pin") {
                        setPinLocation(newTap);
                        return;
                    }
                    setTaps(prevTaps => [...prevTaps, {...newTap, misreadLine: false, misreadSlope: false}]);
                }}
                bounds={viewBounds(currentGreen?.geojson.coordinates, holeBunkers)}
                pinLocation={pinLocation}
                userLocation={userLocation}
                holedOut={holedOut}
                setHoledOut={setHoledOut}
                misreadRef={editPuttRef}
            />
        )
    }, [holeBunkers, fairways, taps, tapMode, pinLocation, holedOut, userLocation, currentGreen]);

    return (
        <>
            {(Object.keys(greens).length === 0 && allBunkers.length === 0) ? (
                <View style={{
                    width: "100%",
                    height: "100%",
                    flexDirection: "flow",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "absolute",
                    zIndex: 100,
                    backgroundColor: colors.background.primary,
                    opacity: 0.9
                }}>
                    <ActivityIndicator size="large"/>
                    <FontText style={{fontSize: 20, fontWeight: 600, color: colors.text.primary}}>Loading course data...</FontText>
                    <FontText style={{fontSize: 20, fontWeight: 600, marginBottom: 16, color: colors.text.primary, textAlign: "center"}}>This might take a while if you haven't loaded this course before.</FontText>
                </View>
            ) : null}
            <ScreenWrapper style={{
                width: "100%",
                flex: 1,
                paddingHorizontal: 20,
                flexDirection: "column",
                marginBottom: 18,
                justifyContent: "space-between"
            }}>
                <View style={{marginLeft: -20}}>
                    <BannerAd ref={bannerRef} unitId={bannerAdId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}/>
                </View>
                <View>
                    <View style={{flexDirection: "row", justifyContent: "space-between"}}>
                        <View style={{flexDirection: "row", marginBottom: 6}}>
                            <FontText style={{fontSize: 40, color: colors.text.primary, fontWeight: 800}} type="title">{hole}</FontText>
                            <FontText style={{fontSize: 18, fontWeight: 700, marginTop: 6}}>{hole === 1 ? "ST" : hole === 2 ? "ND" : hole === 3 ? "RD" : "TH"}</FontText>
                        </View>
                        <View style={{width: "100%", paddingBottom: 12, flexDirection: "col", flex: 1, alignItems: "center", justifyContent: "center"}}>
                            <View style={{flexDirection: "row"}}>
                                <FontText style={{fontVariant: ["tabular-nums"], fontWeight: 600, fontSize: 16}}>Round: </FontText>
                                <ElapsedTimeClock startTime={startTime} styles={{fontSize: 16}}></ElapsedTimeClock>
                            </View>
                            <View style={{flexDirection: "row"}}>
                                <FontText style={{fontSize: 16, fontWeight: 600, fontVariant: ["tabular-nums"]}}>Hole: </FontText>
                                <ElapsedTimeClock startTime={holeStartTime} styles={{fontSize: 16}}></ElapsedTimeClock>
                            </View>
                        </View>
                        <Pressable onPress={() => confirmExitRef.current.present()}>
                            <Svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                 strokeWidth={1.5}
                                 stroke={colors.text.primary} width={32} height={32}>
                                <Path strokeLinecap="round" strokeLinejoin="round"
                                      d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25"/>
                            </Svg>
                        </Pressable>
                    </View>
                </View>
                <View style={{flexDirection: "row", justifyContent: "space-around", gap: 8, marginTop: 12}}>
                    <Pressable onPress={() => {
                        setTapMode("pin");
                    }} style={{
                        paddingRight: 5,
                        paddingLeft: 0,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        flex: 1,
                        borderColor: tapMode === "pin" ? colors.button.radio.selected.border : colors.button.primary.border,
                        backgroundColor: tapMode === "pin" ? colors.button.radio.selected.background : colors.button.primary.background,
                        flexDirection: "row",
                        justifyContent: "center",
                        alignItems: 'center',
                    }}>
                        <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={colors.text.primary}
                             width={18} height={18}>
                            <Path fillRule="evenodd"
                                  d="M3 2.25a.75.75 0 0 1 .75.75v.54l1.838-.46a9.75 9.75 0 0 1 6.725.738l.108.054A8.25 8.25 0 0 0 18 4.524l3.11-.732a.75.75 0 0 1 .917.81 47.784 47.784 0 0 0 .005 10.337.75.75 0 0 1-.574.812l-3.114.733a9.75 9.75 0 0 1-6.594-.77l-.108-.054a8.25 8.25 0 0 0-5.69-.625l-2.202.55V21a.75.75 0 0 1-1.5 0V3A.75.75 0 0 1 3 2.25Z"
                                  clipRule="evenodd"/>
                        </Svg>
                        <FontText
                            style={{color: colors.button.danger.disabled.text, marginLeft: 8, fontWeight: 500}}>Mark
                            Pin</FontText>
                    </Pressable>
                    <Pressable onPress={() => {
                        if (pinLocation === null) return;
                        setTapMode("shot");
                    }} style={({pressed}) => [{
                        paddingHorizontal: 5,
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: pinLocation === null ? colors.button.disabled.border : tapMode === "shot" ? colors.button.radio.selected.border : colors.button.primary.border,
                        backgroundColor: pinLocation === null ? colors.button.disabled.background : tapMode === "shot" ? colors.button.radio.selected.background : colors.button.primary.background,
                        flexDirection: "row",
                        justifyContent: "center",
                        alignItems: 'center',
                    }]}>
                        <FontText style={{color: pinLocation === null ? colors.button.disabled.text : colors.button.primary.text, marginLeft: 4, fontWeight: 500}}>Add Shots</FontText>
                    </Pressable>
                </View>
                {MemoizedGreenPolygon}
                <View style={{flexDirection: "column", marginTop: 4}}>
                    <View style={{flexDirection: "row", alignItems: "center", justifyContent: "center"}}>
                        {prediction && prediction.puttDistanceFeet && (
                            <View style={{position: "absolute", left: 0}}>
                                <Text style={{color: '#777'}}>📏 Distance</Text>
                                <Text style={{fontSize: 18, fontWeight: '700', color: '#333',}}>{prediction.puttDistanceFeet.toFixed(1)} ft</Text>
                            </View>
                        )}
                        <View style={{flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 6}}>
                            <View style={{aspectRatio: 1, width: 14, borderWidth: 1, marginRight: 6, borderRadius: "50%", backgroundColor: "#76eeff"}}></View>
                            <Text style={{fontWeight: 500, fontSize: 14}}>Your Location</Text>
                        </View>
                    </View>

                    <View style={{flexDirection: "row", justifyContent: "space-around", gap: 8, marginTop: 16, borderBottomWidth: 1, borderBottomColor: colors.border.default, paddingBottom: 12}}>
                        <Pressable onPress={() => {
                            if (userLocation === null) return;
                            // check if the user is on the green
                            if (isPointInPolygon(userLocation, currentGreen?.geojson.coordinates)) {
                                if (tapMode === "pin") {
                                    setPinLocation(userLocation);
                                    return;
                                }
                                setTaps(prevTaps => [...prevTaps, {...userLocation, misReadSlope: false, misReadLine: false}]);
                            }
                        }} style={({pressed}) => ({
                            paddingRight: 5,
                            paddingLeft: 0,
                            paddingVertical: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            flex: 1,
                            borderColor: userLocation === null ? colors.button.disabled.border : colors.button.primary.border,
                            backgroundColor: userLocation === null ? colors.button.disabled.background : pressed ? colors.button.primary.depressed : colors.button.primary.background,
                            flexDirection: "row",
                            justifyContent: "center",
                            alignItems: 'center',
                        })}>
                            <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={userLocation === null ? colors.button.disabled.text : colors.button.primary.text} width={20} height={20}>
                                <Path fillRule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                            </Svg>
                            <FontText style={{color: userLocation === null ? colors.button.disabled.text : colors.button.primary.text, marginLeft: 4, fontWeight: 500}}>Mark From Location</FontText>
                        </Pressable>
                        <Pressable onPress={() => {
                            setPinLocation(null);
                            setTaps([]);
                            setTapMode("pin");
                        }} style={({pressed}) => [{
                            paddingHorizontal: 5,
                            flex: 0.5,
                            paddingVertical: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.button.danger.border,
                            backgroundColor:  pressed ? colors.button.danger.depressed : colors.button.danger.background,
                            flexDirection: "row",
                            justifyContent: "center",
                            alignItems: 'center',
                        }]}>
                            <FontText style={{color: colors.button.danger.text, fontWeight: 500}}>Clear Shots</FontText>
                        </Pressable>
                        <Pressable style={({pressed}) => ({alignItems: "center", justifyContent: "center", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.button.primary.border, backgroundColor: pressed ? colors.button.primary.depressed : colors.button.primary.background})} onPress={() => {
                            predictionRef.current.open(prediction);
                        }}>
                            <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={"black"} width={24} height={24}>
                                <Path fillRule="evenodd"
                                      d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z"
                                      clipRule="evenodd"/>
                            </Svg>
                        </Pressable>
                    </View>
                </View>

                <Pressable onPress={() => {
                    if (!holedOut) {
                        setTaps([]);
                        setPinLocation(null);
                    }
                    setHoledOut(!holedOut);
                    setTapMode("pin");
                }} style={{
                    marginTop: 12,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: 'center',
                }}>
                    <FontText style={{
                        color: colors.text.link,
                        marginLeft: 4,
                        fontSize: 16,
                        fontWeight: 500,
                        textAlign: "center"
                    }}>Holed Out?</FontText>
                </Pressable>
                <View style={{flexDirection: "row", justifyContent: "space-between", gap: 4, paddingHorizontal: 16}}>
                    <PrimaryButton style={{borderRadius: 12, paddingVertical: 12, flex: 1, maxWidth: 128}}
                                   title="Back"
                                   disabled={hole === 1 || (holes === 9 && !frontNine && hole === 10)} onPress={lastHole}></PrimaryButton>
                    <PrimaryButton style={{borderRadius: 12, paddingVertical: 12, flex: 1, maxWidth: 128}}
                                   title={hole === holes ? "Submit" : "Next"}
                                   disabled={false}
                                   onPress={() => {
                                        if ((taps.length === 0 || pinLocation === null) && !holedOut) {
                                            // TODO this says next hole even when the last (should say "submit")
                                            noPuttDataModalRef.current.present();
                                        } else {
                                            nextHole();
                                        }
                                    }}></PrimaryButton>
                </View>
            </ScreenWrapper>
            <NoPuttDataModal nextHole={nextHole} isLastHole={(holes === 9 && hole === 9 && frontNine) || hole === 18} noPuttDataModalRef={noPuttDataModalRef}/>
            <ConfirmExit confirmExitRef={confirmExitRef} cancel={() => confirmExitRef.current.dismiss()} canPartial={roundData.reduce((acc, hole) => hole.taps && (hole.taps.length || hole.holedOut) > 0 ? 1 + acc : acc, 0) > 1} partial={() => {
                try {
                    confirmExitRef.current.dismiss();
                    AsyncStorage.removeItem("currentRound");
                    submit();
                } catch(e) {
                    console.error("Error submitting partial round: " + e);
                }
            }} saveForLater={() => {
                router.replace("/practice");
            }} end={fullReset}></ConfirmExit>
            <EditPuttModal editPuttRef={editPuttRef} setMisreadSlope={(index) => {
                setTaps(prev => {
                    const newTaps = [...prev];
                    newTaps[index].misreadSlope = !newTaps[index].misreadSlope;
                    return newTaps;
                });
            }} setMisreadLine={index => {
                setTaps(prev => {
                    const newTaps = [...prev];
                    newTaps[index].misreadLine = !newTaps[index].misreadLine;
                    return newTaps;
                });
            }} deletePutt={index => {
                setTaps(prev => {
                    const newTaps = [];
                    for (let i = 0; i < prev.length; i++) {
                        if (i === index) continue;
                        newTaps.push(prev[i]);
                    }
                    return newTaps;
                });
            }}/>
            <PuttPredictionModal puttPredictionRef={predictionRef}/>
        </>
    )
}