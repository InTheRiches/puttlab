import {Image, Platform, Pressable, View} from "react-native";
import React from "react";
import useColors from "../../hooks/useColors";
import {Path, Svg} from "react-native-svg";
import {useRouter} from "expo-router";
import {BannerAd, BannerAdSize, TestIds, useForeground} from "react-native-google-mobile-ads";

const bannerAdId = __DEV__ ? TestIds.BANNER : Platform.OS === "ios" ? "ca-app-pub-2701716227191721/2179330685" : "ca-app-pub-2701716227191721/9866249014";

export function Header({bottomBorder = false}) {
    const colors = useColors();
    const router = useRouter();

    const bannerRef = React.useRef(null);
    const [adLoaded, setAdLoaded] = React.useState(false);

    useForeground(() => {
        bannerRef.current?.load();
    })

    return (
        <View style={{marginBottom: !bottomBorder ? 4 : 0}}>
            <View style={{
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "row",
                width: "100%",
                paddingBottom: 0,
                borderBottomColor: colors.border.default,
                borderBottomWidth: bottomBorder ? 1 : 0,
                marginBottom: bottomBorder ? 12 : 4
            }}>
                <Image source={require('@/assets/branding/FlatstickWithMallet.png')} style={{aspectRatio: 2458/614, width: 180}}/>
                <Pressable
                    onPress={() => router.push('/settings')}
                    style={{
                        backgroundColor: colors.text.primary,
                        borderRadius: 50,
                        padding: 6,
                        aspectRatio: 1,
                        position: "absolute",
                        right: 0,

                    }}
                >
                    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={colors.background.secondary} width={27} height={27}>
                        <Path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clipRule="evenodd" />
                    </Svg>
                </Pressable>
            </View>
            {/*{!bottomBorder && (*/}
            {/*    <View style={{justifyContent: "center", alignItems: "center"}}>*/}
            {/*        <BannerAd ref={bannerRef} unitId={bannerAdId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />*/}
            {/*    </View>*/}
            {/*)}*/}
        </View>
    )
}