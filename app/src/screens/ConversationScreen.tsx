import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { converse } from "../api/client";
import { colors, font, radius, spacing } from "../theme";

// The séance proper. The object is awake — now you hold the mic and it talks
// back. Hold-to-talk records voice (expo-av), the server transcribes + replies
// in character, and we play the spoken reply (base64 mp3 → expo-av Sound).
// A typed fallback covers loud rooms and mic-less devices.

type Props = NativeStackScreenProps<RootStackParamList, "Conversation">;

type Turn = { role: "user" | "assistant"; text: string };

export default function ConversationScreen({ route, navigation }: Props) {
  const { persona } = route.params.result;
  const { objectKey, name, backstory } = persona;

  // The opening line is the first thing the spirit ever said — seed the log.
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", text: backstory }]);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [micDenied, setMicDenied] = useState(false);
  const [noTts, setNoTts] = useState(false);

  // Imperative handles we must clean up. Refs (not state) so cleanup is exact.
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const mounted = useRef(true);
  const busy = recording || sending; // any input that blocks the next action

  // Pulse animations: amber while listening, cyan while the spirit speaks.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Tear down anything still live so we don't leak audio sessions.
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  // Drive the pulse loop whenever we're listening or speaking; rest otherwise.
  useEffect(() => {
    if (recording || speaking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
  }, [recording, speaking, pulse]);

  // Auto-scroll to the latest turn whenever the log grows or a state shifts.
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [turns, sending]);

  // --- audio playback ---------------------------------------------------

  // Always unload any prior Sound before loading a new one (rule: one at a time).
  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // already gone
      }
      soundRef.current = null;
    }
  }, []);

  const playReply = useCallback(
    async (base64: string) => {
      await stopSound();
      // Make sure iOS routes to the speaker, not the recording session.
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${base64}` },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        if (mounted.current) setSpeaking(true);
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            stopSound();
            if (mounted.current) setSpeaking(false);
          }
        });
      } catch {
        // Playback failure is non-fatal — the reply text is already on screen.
        if (mounted.current) setSpeaking(false);
      }
    },
    [stopSound],
  );

  // --- shared converse handler -----------------------------------------

  const send = useCallback(
    async (input: { audioUri?: string; text?: string }) => {
      if (!mounted.current) return;
      setError(null);
      setSending(true);
      try {
        const data = await converse({ objectKey, ...input });
        if (!mounted.current) return;
        const next: Turn[] = [];
        if (data.userText?.trim()) next.push({ role: "user", text: data.userText });
        next.push({ role: "assistant", text: data.replyText });
        setTurns((prev) => [...prev, ...next]);
        if (data.audio) {
          setNoTts(false);
          playReply(data.audio);
        } else {
          // No Deepgram key / mock mode — show text only, no native TTS exists.
          setNoTts(true);
        }
      } catch (e: any) {
        if (mounted.current) setError(e?.message || "The connection wavered. Try again.");
      } finally {
        if (mounted.current) setSending(false);
      }
    },
    [objectKey, playReply],
  );

  // --- hold-to-talk recording ------------------------------------------

  const startRecording = useCallback(async () => {
    if (busy) return;
    setError(null);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setMicDenied(true);
        return;
      }
      setMicDenied(false);
      await stopSound(); // don't talk over the spirit
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = rec;
      if (mounted.current) setRecording(true);
    } catch (e: any) {
      recordingRef.current = null;
      if (mounted.current) {
        setRecording(false);
        setError(e?.message || "Couldn't start the recording.");
      }
    }
  }, [busy, stopSound]);

  const stopRecording = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    setRecording(false);
    let uri: string | null = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch {
      // recording never really started / device hiccup
    }
    // Restore playback routing on iOS so the reply is audible.
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
    if (!uri) {
      if (mounted.current) setError("Nothing was heard — hold the orb a little longer.");
      return;
    }
    send({ audioUri: uri });
  }, [send]);

  // --- text fallback ----------------------------------------------------

  const sendText = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    send({ text });
  }, [draft, busy, send]);

  // --- render -----------------------------------------------------------

  const orbScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const orbGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* Header: who you're talking to + a way out of the séance. */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.subtitle}>{speaking ? "speaking…" : "is listening"}</Text>
        </View>
        <Pressable onPress={() => navigation.popToTop()} style={styles.leaveBtn} hitSlop={8}>
          <Text style={styles.leaveText}>Leave</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {/* Transcript */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.transcript}
          keyboardDismissMode="interactive"
        >
          {turns.map((t, i) =>
            t.role === "user" ? (
              <View key={i} style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{t.text}</Text>
              </View>
            ) : (
              <View key={i} style={styles.assistantRow}>
                <Text style={styles.speakerLabel}>{name}</Text>
                <View style={[styles.bubble, styles.assistantBubble]}>
                  <Text style={styles.assistantText}>{t.text}</Text>
                </View>
              </View>
            ),
          )}

          {/* "thinking…" while we await the reply. */}
          {sending && (
            <View style={styles.assistantRow}>
              <Text style={styles.speakerLabel}>{name}</Text>
              <View style={[styles.bubble, styles.assistantBubble, styles.thinking]}>
                <ActivityIndicator size="small" color={colors.spirit} />
                <Text style={styles.thinkingText}>channeling…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Inline status / errors — dim, never crashes the screen. */}
        {error && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{error}</Text>
          </View>
        )}
        {noTts && !error && (
          <Text style={styles.hint}>🔇 voice off (no TTS key)</Text>
        )}

        {/* Mic denied → guidance + a jump to Settings. Recording disabled. */}
        {micDenied && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Microphone access is off. Use text below, or…</Text>
            <Pressable onPress={() => Linking.openSettings()} hitSlop={6}>
              <Text style={styles.bannerLink}>Open Settings</Text>
            </Pressable>
          </View>
        )}

        {/* Hold-to-talk orb */}
        <View style={styles.micZone}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbGlow,
              {
                opacity: recording || speaking ? orbGlow : 0,
                transform: [{ scale: orbScale }],
                shadowColor: speaking ? colors.spirit : colors.accent,
                backgroundColor: speaking ? colors.spiritDim : colors.accent,
              },
            ]}
          />
          <Pressable
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={micDenied || sending}
            style={({ pressed }) => [
              styles.orb,
              recording && styles.orbActive,
              (micDenied || sending) && styles.orbDisabled,
              pressed && !micDenied && !sending && styles.orbPressed,
            ]}
          >
            <Text style={styles.orbLabel}>
              {recording ? "Listening…" : sending ? "…" : "Hold"}
            </Text>
          </Pressable>
          <Text style={styles.micCaption}>
            {recording ? "release to send" : "hold to speak"}
          </Text>
        </View>

        {/* Text fallback — always available. */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="…or type to the spirit"
            placeholderTextColor={colors.textFaint}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={sendText}
            multiline
          />
          <Pressable
            onPress={sendText}
            disabled={!draft.trim() || busy}
            style={({ pressed }) => [
              styles.sendBtn,
              (!draft.trim() || busy) && styles.sendBtnDisabled,
              pressed && styles.sendBtnPressed,
            ]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1 },
  name: { ...font.title, fontSize: 20 },
  subtitle: { ...font.caption, color: colors.spiritDim, marginTop: 2 },
  leaveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  leaveText: { ...font.caption, color: colors.textDim },

  transcript: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },

  bubble: {
    maxWidth: "82%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.surface,
    borderBottomRightRadius: radius.sm,
  },
  userText: { ...font.body },

  assistantRow: { alignSelf: "flex-start", maxWidth: "88%" },
  speakerLabel: {
    ...font.caption,
    color: colors.accentSoft,
    marginBottom: 4,
    marginLeft: spacing.xs,
  },
  assistantBubble: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  assistantText: { ...font.body, color: colors.text },

  thinking: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  thinkingText: { ...font.caption, color: colors.spirit, fontStyle: "italic" },

  banner: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerText: { ...font.caption, color: colors.textDim, flexShrink: 1 },
  bannerLink: { ...font.caption, color: colors.spirit, fontWeight: "700" },
  hint: {
    ...font.caption,
    color: colors.textFaint,
    textAlign: "center",
    marginBottom: spacing.sm,
  },

  micZone: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm },
  orbGlow: {
    position: "absolute",
    top: spacing.sm,
    width: 108,
    height: 108,
    borderRadius: radius.pill,
    shadowOpacity: 0.9,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  orb: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  orbActive: { backgroundColor: colors.accent, borderColor: colors.accentSoft },
  orbPressed: { transform: [{ scale: 0.96 }] },
  orbDisabled: { opacity: 0.4, borderColor: colors.border },
  orbLabel: { ...font.body, fontWeight: "700", color: colors.text },
  micCaption: { ...font.caption, color: colors.textFaint, marginTop: spacing.xs },

  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: font.body.fontSize,
  },
  sendBtn: {
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnPressed: { opacity: 0.8 },
  sendText: { ...font.body, fontWeight: "700", color: colors.bg },
});
