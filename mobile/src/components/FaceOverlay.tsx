/**
 * FaceOverlay — a cartoon "spirit face" (googly eyes + a talking mouth) that drops
 * on top of an object's portrait so the object itself looks alive, Mr. Potato Head
 * style. Absolute-fills its parent; size its parent and the features scale to match.
 *
 * Eyes blink irregularly and the pupils drift (idle "alive"); the mouth flaps while
 * `speaking` is true. Pure react-native Animated (native-driver transforms only) —
 * no extra deps, no per-frame JS.
 *
 *   <View style={{ width, height }}>
 *     <Image source={{ uri }} style={StyleSheet.absoluteFill} />
 *     <FaceOverlay speaking={agentSpeaking} />
 *   </View>
 */
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

const EYE_WHITE = "#FBF7F0";
const INK = "#1A0F0B";
const MOUTH = "#3A1410";

function Eye({
  cx, cy, w, h, pupil, border, blink, gaze,
}: {
  cx: number; cy: number; w: number; h: number; pupil: number; border: number;
  blink: Animated.Value; gaze: Animated.ValueXY;
}) {
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        borderRadius: Math.min(w, h) / 2,
        backgroundColor: EYE_WHITE,
        borderWidth: border,
        borderColor: INK,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transform: [{ scaleY: blink }], // blink squashes the eye vertically
      }}
    >
      <Animated.View
        style={{
          width: pupil,
          height: pupil,
          borderRadius: pupil / 2,
          backgroundColor: INK,
          transform: gaze.getTranslateTransform(), // pupil drifts to look around
        }}
      />
    </Animated.View>
  );
}

function Mouth({
  cx, cy, w, h, border, open,
}: {
  cx: number; cy: number; w: number; h: number; border: number; open: Animated.Value;
}) {
  // open 0..1 → vertical scale: a thin closed line at rest, a wide oval when talking.
  const scaleY = open.interpolate({ inputRange: [0, 1], outputRange: [0.14, 1] });
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        borderRadius: h / 2,
        backgroundColor: MOUTH,
        borderWidth: border,
        borderColor: INK,
        overflow: "hidden",
        alignItems: "center",
        transform: [{ scaleY }],
      }}
    >
      {/* teeth strip — reads as an open mouth when flapping */}
      <View
        style={{
          position: "absolute",
          top: h * 0.1,
          width: w * 0.66,
          height: h * 0.24,
          backgroundColor: EYE_WHITE,
          borderRadius: 3,
        }}
      />
    </Animated.View>
  );
}

export function FaceOverlay({ speaking }: { speaking: boolean }) {
  const [dim, setDim] = useState({ w: 0, h: 0 });

  const blink = useRef(new Animated.Value(1)).current;
  const gaze = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const mouth = useRef(new Animated.Value(0)).current;

  // Irregular blinking.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.08, duration: 70, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: true }),
      ]).start(() => {
        if (alive) timer = setTimeout(loop, 2200 + Math.random() * 3500);
      });
    };
    timer = setTimeout(loop, 1200 + Math.random() * 2000);
    return () => { alive = false; clearTimeout(timer); };
  }, [blink]);

  // Saccade-like gaze drift.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const reach = (Math.min(dim.w, dim.h) || 40) * 0.06;
    const loop = () => {
      if (!alive) return;
      Animated.timing(gaze, {
        toValue: { x: (Math.random() - 0.5) * 2 * reach, y: (Math.random() - 0.5) * 1.4 * reach },
        duration: 450,
        useNativeDriver: true,
      }).start(() => {
        if (alive) timer = setTimeout(loop, 1200 + Math.random() * 2600);
      });
    };
    timer = setTimeout(loop, 700);
    return () => { alive = false; clearTimeout(timer); };
  }, [gaze, dim.w, dim.h]);

  // Mouth: flap while speaking, settle closed otherwise.
  useEffect(() => {
    let alive = true;
    if (speaking) {
      const flap = () => {
        if (!alive) return;
        Animated.timing(mouth, {
          toValue: 0.35 + Math.random() * 0.65,
          duration: 90 + Math.random() * 70,
          useNativeDriver: true,
        }).start(() => {
          if (!alive) return;
          Animated.timing(mouth, {
            toValue: 0.05 + Math.random() * 0.2,
            duration: 90 + Math.random() * 70,
            useNativeDriver: true,
          }).start(() => flap());
        });
      };
      flap();
    } else {
      Animated.timing(mouth, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    return () => { alive = false; };
  }, [speaking, mouth]);

  const S = Math.min(dim.w, dim.h);
  const ready = S > 0;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setDim((d) => (d.w === width && d.h === height ? d : { w: width, h: height }));
      }}
    >
      {ready && (
        <>
          <Eye
            cx={dim.w * 0.34} cy={dim.h * 0.42}
            w={S * 0.24} h={S * 0.28} pupil={S * 0.12}
            border={Math.max(1.5, S * 0.022)} blink={blink} gaze={gaze}
          />
          <Eye
            cx={dim.w * 0.66} cy={dim.h * 0.42}
            w={S * 0.24} h={S * 0.28} pupil={S * 0.12}
            border={Math.max(1.5, S * 0.022)} blink={blink} gaze={gaze}
          />
          <Mouth
            cx={dim.w * 0.5} cy={dim.h * 0.66}
            w={S * 0.34} h={S * 0.26}
            border={Math.max(1.5, S * 0.02)} open={mouth}
          />
        </>
      )}
    </View>
  );
}
