// ============================================================
// GODSPEED — Mobile Data Input Components (React Native / Expo)
// Optimized for courtside coaching: large tap targets, minimal typing
// ============================================================

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../lib/supabase"; // Your existing Supabase client

// ============================================================
// 1. QUICK TRAINING LOG — Voice/text → AI processes instantly
// ============================================================
export function QuickTrainingLog({ teamId, season }) {
  const [rawInput, setRawInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = useCallback(async () => {
    if (!rawInput.trim()) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Create upload record
      const { data: upload, error: uploadError } = await supabase
        .from("data_uploads")
        .insert({
          upload_type: "training_data",
          source: "mobile_app",
          raw_content: rawInput.trim(),
          ai_status: "pending",
          target_team_id: teamId,
          uploaded_by: user.id,
        })
        .select("id")
        .single();

      if (uploadError) throw uploadError;

      // 2. Trigger AI processing Edge Function
      const { data: processResult, error: processError } = await supabase.functions.invoke(
        "process-upload",
        { body: { upload_id: upload.id } }
      );

      if (processError) throw processError;

      setResult(processResult);
      setRawInput("");
      Alert.alert("Done", "Training data processed and saved.");
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [rawInput, teamId]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-black"
    >
      <ScrollView className="flex-1 px-4 pt-6">
        <Text className="text-white text-2xl font-bold mb-2">
          Log Training
        </Text>
        <Text className="text-gray-400 text-sm mb-4">
          Type or paste training notes. AI will organize per player automatically.
        </Text>

        <TextInput
          className="bg-zinc-900 text-white text-base p-4 rounded-xl min-h-[200px] border border-zinc-700"
          placeholder={`Example:\nPractice 3/25 at Apex Gym\nFocused on shooting and defense\nJaylen - great effort, 7/10 from mid\nMarcus - late, needs work on handles\nIsaiah - absent (excused)\nDid 3v3 half court for 20 min`}
          placeholderTextColor="#666"
          multiline
          textAlignVertical="top"
          value={rawInput}
          onChangeText={setRawInput}
          autoCapitalize="sentences"
          returnKeyType="default"
        />

        <TouchableOpacity
          className={`mt-4 py-4 rounded-xl items-center ${
            isSubmitting || !rawInput.trim()
              ? "bg-zinc-700"
              : "bg-emerald-600"
          }`}
          onPress={handleSubmit}
          disabled={isSubmitting || !rawInput.trim()}
        >
          {isSubmitting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color="white" size="small" />
              <Text className="text-white font-bold text-lg">AI Processing...</Text>
            </View>
          ) : (
            <Text className="text-white font-bold text-lg">Submit & Auto-Organize</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View className="mt-4 bg-emerald-900/30 border border-emerald-700 rounded-xl p-4">
            <Text className="text-emerald-400 font-bold">Processed</Text>
            <Text className="text-emerald-300 text-sm mt-1">
              Type: {result.type} | ID: {result.result_id?.slice(0, 8)}...
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// 2. QUICK GAME STATS — Tap-based stat entry per player
// ============================================================
export function QuickGameStats({ gameId, athletes }) {
  const [stats, setStats] = useState(
    athletes.reduce((acc, a) => {
      acc[a.id] = {
        points: 0, assists: 0, rebounds: 0, steals: 0,
        blocks: 0, turnovers: 0, fouls: 0,
        fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
      };
      return acc;
    }, {})
  );
  const [activePlayer, setActivePlayer] = useState(athletes[0]?.id);
  const [isSaving, setIsSaving] = useState(false);

  const increment = (stat) => {
    setStats((prev) => ({
      ...prev,
      [activePlayer]: {
        ...prev[activePlayer],
        [stat]: prev[activePlayer][stat] + 1,
      },
    }));
  };

  const decrement = (stat) => {
    setStats((prev) => ({
      ...prev,
      [activePlayer]: {
        ...prev[activePlayer],
        [stat]: Math.max(0, prev[activePlayer][stat] - 1),
      },
    }));
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const rows = Object.entries(stats).map(([athleteId, s]) => ({
        game_id: gameId,
        athlete_id: athleteId,
        points: s.points,
        field_goals_made: s.fgm,
        field_goals_attempted: s.fga,
        three_pointers_made: s.tpm,
        three_pointers_attempted: s.tpa,
        free_throws_made: s.ftm,
        free_throws_attempted: s.fta,
        offensive_rebounds: 0,
        defensive_rebounds: s.rebounds,
        assists: s.assists,
        turnovers: s.turnovers,
        steals: s.steals,
        blocks: s.blocks,
        fouls: s.fouls,
      }));

      const { error } = await supabase
        .from("player_game_stats")
        .upsert(rows, { onConflict: "game_id,athlete_id" });

      if (error) throw error;
      Alert.alert("Saved", "All player stats saved to this game.");
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const StatButton = ({ label, stat, color = "bg-zinc-800" }) => (
    <View className="items-center mx-1">
      <Text className="text-gray-400 text-xs mb-1">{label}</Text>
      <View className="flex-row items-center">
        <TouchableOpacity
          className="bg-red-900/50 w-10 h-10 rounded-l-lg items-center justify-center"
          onPress={() => decrement(stat)}
        >
          <Text className="text-red-400 text-xl font-bold">−</Text>
        </TouchableOpacity>
        <View className={`${color} w-12 h-10 items-center justify-center`}>
          <Text className="text-white text-lg font-bold">
            {stats[activePlayer]?.[stat] ?? 0}
          </Text>
        </View>
        <TouchableOpacity
          className="bg-emerald-900/50 w-10 h-10 rounded-r-lg items-center justify-center"
          onPress={() => increment(stat)}
        >
          <Text className="text-emerald-400 text-xl font-bold">+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-black">
      {/* Player Selector — Horizontal Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-2 py-3 max-h-16"
      >
        {athletes.map((a) => (
          <TouchableOpacity
            key={a.id}
            className={`px-4 py-2 rounded-full mr-2 ${
              activePlayer === a.id ? "bg-emerald-600" : "bg-zinc-800"
            }`}
            onPress={() => setActivePlayer(a.id)}
          >
            <Text className={`font-bold ${
              activePlayer === a.id ? "text-white" : "text-gray-400"
            }`}>
              #{a.jersey_number} {a.first_name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Active Player Header */}
      <View className="px-4 py-2 border-b border-zinc-800">
        <Text className="text-white text-xl font-bold">
          {athletes.find((a) => a.id === activePlayer)?.display_name}
        </Text>
        <Text className="text-emerald-400 text-3xl font-bold">
          {stats[activePlayer]?.points ?? 0} PTS
        </Text>
      </View>

      {/* Stat Grid — Large Tap Targets */}
      <ScrollView className="flex-1 px-2 pt-4">
        <Text className="text-gray-500 text-xs uppercase tracking-wider px-2 mb-2">
          Scoring
        </Text>
        <View className="flex-row flex-wrap justify-center mb-4">
          <StatButton label="PTS" stat="points" color="bg-amber-900/50" />
          <StatButton label="FGM" stat="fgm" />
          <StatButton label="FGA" stat="fga" />
          <StatButton label="3PM" stat="tpm" />
          <StatButton label="3PA" stat="tpa" />
        </View>

        <View className="flex-row flex-wrap justify-center mb-4">
          <StatButton label="FTM" stat="ftm" />
          <StatButton label="FTA" stat="fta" />
        </View>

        <Text className="text-gray-500 text-xs uppercase tracking-wider px-2 mb-2">
          Playmaking & Defense
        </Text>
        <View className="flex-row flex-wrap justify-center mb-4">
          <StatButton label="AST" stat="assists" />
          <StatButton label="REB" stat="rebounds" />
          <StatButton label="STL" stat="steals" />
          <StatButton label="BLK" stat="blocks" />
          <StatButton label="TO" stat="turnovers" />
          <StatButton label="PF" stat="fouls" />
        </View>
      </ScrollView>

      {/* Save Button — Fixed Bottom */}
      <View className="px-4 pb-8 pt-2 border-t border-zinc-800">
        <TouchableOpacity
          className={`py-4 rounded-xl items-center ${isSaving ? "bg-zinc-700" : "bg-emerald-600"}`}
          onPress={handleSaveAll}
          disabled={isSaving}
        >
          <Text className="text-white font-bold text-lg">
            {isSaving ? "Saving..." : "Save All Stats"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================
// 3. QUICK ATTENDANCE — Swipe/tap attendance for practice
// ============================================================
export function QuickAttendance({ sessionId, athletes }) {
  const [attendance, setAttendance] = useState(
    athletes.reduce((acc, a) => {
      acc[a.id] = { status: "present", effort: 3 };
      return acc;
    }, {})
  );
  const [isSaving, setIsSaving] = useState(false);

  const cycleStatus = (athleteId) => {
    const order = ["present", "absent", "late", "excused"];
    setAttendance((prev) => {
      const current = prev[athleteId].status;
      const nextIdx = (order.indexOf(current) + 1) % order.length;
      return { ...prev, [athleteId]: { ...prev[athleteId], status: order[nextIdx] } };
    });
  };

  const setEffort = (athleteId, rating) => {
    setAttendance((prev) => ({
      ...prev,
      [athleteId]: { ...prev[athleteId], effort: rating },
    }));
  };

  const statusColors = {
    present: "bg-emerald-600",
    absent: "bg-red-600",
    late: "bg-amber-600",
    excused: "bg-blue-600",
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const rows = Object.entries(attendance).map(([athleteId, att]) => ({
        session_id: sessionId,
        athlete_id: athleteId,
        status: att.status,
        effort_rating: att.status === "present" || att.status === "late" ? att.effort : null,
      }));

      const { error } = await supabase
        .from("training_attendance")
        .upsert(rows, { onConflict: "session_id,athlete_id" });

      if (error) throw error;
      Alert.alert("Saved", "Attendance recorded.");
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <View className="px-4 py-4">
        <Text className="text-white text-2xl font-bold">Attendance</Text>
        <Text className="text-gray-400 text-sm">Tap name to cycle status. Rate effort 1-5.</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {athletes.map((a) => {
          const att = attendance[a.id];
          const isPresent = att.status === "present" || att.status === "late";

          return (
            <View key={a.id} className="flex-row items-center py-3 border-b border-zinc-800">
              <TouchableOpacity
                className="flex-1 flex-row items-center"
                onPress={() => cycleStatus(a.id)}
              >
                <View className={`w-3 h-3 rounded-full mr-3 ${statusColors[att.status]}`} />
                <View className="flex-1">
                  <Text className="text-white font-semibold">
                    #{a.jersey_number} {a.display_name}
                  </Text>
                  <Text className={`text-xs capitalize ${
                    att.status === "present" ? "text-emerald-400" :
                    att.status === "absent" ? "text-red-400" :
                    att.status === "late" ? "text-amber-400" : "text-blue-400"
                  }`}>
                    {att.status}
                  </Text>
                </View>
              </TouchableOpacity>

              {isPresent && (
                <View className="flex-row gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity
                      key={n}
                      className={`w-8 h-8 rounded items-center justify-center ${
                        att.effort >= n ? "bg-emerald-600" : "bg-zinc-800"
                      }`}
                      onPress={() => setEffort(a.id, n)}
                    >
                      <Text className="text-white text-sm font-bold">{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View className="px-4 pb-8 pt-2 border-t border-zinc-800">
        <TouchableOpacity
          className={`py-4 rounded-xl items-center ${isSaving ? "bg-zinc-700" : "bg-emerald-600"}`}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text className="text-white font-bold text-lg">
            {isSaving ? "Saving..." : "Save Attendance"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================
// 4. QUICK GAME LOG — Voice/text → AI processes game instantly
// ============================================================
export function QuickGameLog({ teamId, season }) {
  const [rawInput, setRawInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!rawInput.trim()) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: upload, error: uploadError } = await supabase
        .from("data_uploads")
        .insert({
          upload_type: "game_stats",
          source: "mobile_app",
          raw_content: rawInput.trim(),
          ai_status: "pending",
          target_team_id: teamId,
          uploaded_by: user.id,
        })
        .select("id")
        .single();

      if (uploadError) throw uploadError;

      const { error: processError } = await supabase.functions.invoke(
        "process-upload",
        { body: { upload_id: upload.id } }
      );

      if (processError) throw processError;

      setRawInput("");
      Alert.alert("Done", "Game data processed. Stats routed to each player and parent portal.");
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [rawInput, teamId]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-black"
    >
      <ScrollView className="flex-1 px-4 pt-6">
        <Text className="text-white text-2xl font-bold mb-2">Log Game</Text>
        <Text className="text-gray-400 text-sm mb-4">
          Paste or type game results. AI will parse scores, stats, and route to parent portals.
        </Text>

        <TextInput
          className="bg-zinc-900 text-white text-base p-4 rounded-xl min-h-[200px] border border-zinc-700"
          placeholder={`Example:\nGS vs Rocky Mountain Elite, 3/25\nTournament game at Apex\nWon 48-36\n\nJaylen: 18pts (6/10 FG, 2/4 3PT), 5reb, 3ast\nMarcus: 12pts, 4ast, 2stl\nIsaiah: 8pts, 7reb, 2blk\nDevin: 6pts, 3ast\nKaiden: 4pts, 2reb, 1stl`}
          placeholderTextColor="#666"
          multiline
          textAlignVertical="top"
          value={rawInput}
          onChangeText={setRawInput}
        />

        <TouchableOpacity
          className={`mt-4 py-4 rounded-xl items-center ${
            isSubmitting || !rawInput.trim() ? "bg-zinc-700" : "bg-emerald-600"
          }`}
          onPress={handleSubmit}
          disabled={isSubmitting || !rawInput.trim()}
        >
          {isSubmitting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color="white" size="small" />
              <Text className="text-white font-bold text-lg">AI Processing...</Text>
            </View>
          ) : (
            <Text className="text-white font-bold text-lg">Submit & Auto-Organize</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
