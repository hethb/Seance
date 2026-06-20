import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AwakenResponse } from "./types";
import CaptureScreen from "./screens/CaptureScreen";
import AwakeningScreen from "./screens/AwakeningScreen";
import RevealScreen from "./screens/RevealScreen";
import ConversationScreen from "./screens/ConversationScreen";

// The screen flow, end to end:
//   Capture  → take a photo of an object
//   Awakening → "waking up…" while the persona is channeled (/api/awaken)
//   Reveal   → portrait + name + tagline + spoken opening line
//   Conversation → hold-to-talk voice chat (/api/converse)
export type RootStackParamList = {
  Capture: undefined;
  Awakening: { imageDataUrl: string };
  Reveal: { result: AwakenResponse; imageDataUrl: string };
  Conversation: { result: AwakenResponse };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Capture"
      screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "#0b0612" } }}
    >
      <Stack.Screen name="Capture" component={CaptureScreen} />
      <Stack.Screen name="Awakening" component={AwakeningScreen} />
      <Stack.Screen name="Reveal" component={RevealScreen} />
      <Stack.Screen name="Conversation" component={ConversationScreen} />
    </Stack.Navigator>
  );
}
