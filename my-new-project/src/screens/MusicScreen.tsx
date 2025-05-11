import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ScrollView, AppState, TextInput, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import * as MediaLibrary from "expo-media-library";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { trackEvent } from "@aptabase/react-native";
import database from '@react-native-firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';


type Song = {
  id: string;
  title: string;
  uri: string;
};

export default function MusicScreen() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [repeatMode, setRepeatMode] = useState(false); // Add state to handle repeat mode

  const [playlists, setPlaylists] = useState<string[]>(['Default Playlist']);
  const [selectedPlaylist, setSelectedPlaylist] = useState('Default Playlist');
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');


  const scrollViewRef = useRef<ScrollView | null>(null);
  const playbackRef = useRef<Audio.Sound | null>(null);
  const nextSongRef = useRef<() => void>(() => { });
  const appState = useRef(AppState.currentState);
  Audio.setAudioModeAsync({
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  });
  const handleAddPlaylist = () => {
    if (newPlaylistName.trim() === '') return;

    const updatedPlaylists = [...playlists, newPlaylistName.trim()];
    setPlaylists(updatedPlaylists);
    setSelectedPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
    setDropdownVisible(false);
  };
  const fetchFirebaseSongs = async (): Promise<Song[]> => {
    const snapshot = await database().ref("music").once("value");
    const data = snapshot.val();
    if (!data) return [];

    return Object.entries(data)
      .filter(([, val]) => val != null)
      .map(([key, val]) => ({
        id: key,
        title: (val as any).title || "Untitled",
        uri: (val as any).uri || "",
      }));
  };

  const handleSelectPlaylist = (playlistName: string) => {
    setSelectedPlaylist(playlistName);
    setDropdownVisible(false);
  };

  useEffect(() => {
    // Initialize audio mode and permissions
    initializeAudio();

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      // Cleanup on unmount
      releasePlayer();
      subscription.remove();
    };
  }, []);
  const initializeAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });
      await requestPermissions();
    } catch (error) {
      console.error('Error initializing audio:', error);
    }
  };
  const handleAppStateChange = async (nextAppState: any) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App coming to foreground
      if (selectedSong && sound) {
        await sound.playAsync();
      }
    } else if (nextAppState.match(/inactive|background/)) {
      // App going to background
      if (isPlaying) {
        await sound?.pauseAsync();
      }
    }
    appState.current = nextAppState;
  };
  const releasePlayer = async () => {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        playbackRef.current = null;
      }
    } catch (error) {
      console.error('Error releasing player:', error);
    }
  };
  useEffect(() => {
    requestPermissions();
  }, []);
  useEffect(() => {
    if (songs.length === 0 || !selectedSong) return; // Ensure songs are loaded before assigning

    nextSongRef.current = repeatMode ? handleReset : handleNext;
  }, [repeatMode, songs, selectedSong]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.stopAsync();
        sound.unloadAsync();
      }
      setSound(null);
      playbackRef.current = null;
    };
  }, []);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };
  const requestPermissions = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === "granted") {
      loadSongs();

    } else {
      console.error("Permission denied for media library.");
    }
  };

  const loadSongs = async () => {
    try {

      const media = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 1000,
      });

      const localSongs: Song[] = media.assets.map((item) => ({
        id: `local-${item.id}`,
        title: item.filename,
        uri: item.uri,
      }));

      const firebaseSongs = await fetchFirebaseSongs();

      const combinedSongs = [...firebaseSongs, ...localSongs];

      setSongs(combinedSongs);
      setSelectedSong(null);


    } catch (error) {
      console.error("Error loading songs:", error);
    }
  };


  const playSong = async (song: Song) => {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: song.uri },
        { shouldPlay: true }
      );
      const songname = song.title;
      const songlength = duration;
      setSound(newSound);
      setSelectedSong(song);
      setIsPlaying(true);
      setProgress(0);
      trackEvent("playsong_title", { songname, songlength });
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ x: 0, animated: true });
      }

      playbackRef.current = newSound;

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setDuration(status.durationMillis! / 1000);
          setIsPlaying(status.isPlaying);
          if (!isSeeking) {
            setCurrentTime(status.positionMillis! / 1000);
            setProgress(status.positionMillis! / status.durationMillis!);
          }

          if (status.didJustFinish) {
            nextSongRef.current();
          }
        }
      });

      // Handle repeat mode

    } catch (error) {
      console.error("Error playing song:", error);
    }
  };

  const handleNext = async () => {
    if (!selectedSong || songs.length === 0) return;

    const currentIndex = songs.findIndex((song) => song.id === selectedSong.id);
    const nextIndex = (currentIndex + 1) % songs.length;
    const nextSong = songs[nextIndex];


    await playSong(nextSong);
  };

  const handleShuffle = () => {
    if (songs.length === 0) return;
    const randomIndex = Math.floor(Math.random() * songs.length);
    playSong(songs[randomIndex]);
  };

  const handleGoBack = () => {
    if (!selectedSong || songs.length === 0) return;
    const currentIndex = songs.findIndex((song) => song.id === selectedSong.id);
    if (currentIndex > 0) {
      playSong(songs[currentIndex - 1]);
    }
  };

  const handleReset = async () => {
    if (!sound) return;
    await sound.replayAsync();
    setProgress(0);
    setCurrentTime(0);
  };

  const handleSliderChangeStart = () => {
    setIsSeeking(true);
  };
  const handleSliderChangeEnd = async (value: number) => {
    if (sound) {
      const newPositionMillis = value * duration * 1000;
      if (newPositionMillis <= duration * 1000) {
        await sound.setPositionAsync(newPositionMillis);
        setCurrentTime(value * duration);
        setProgress(value);
      }
    }
    setIsSeeking(false);
  };


  const togglePlayPause = async () => {
    if (!sound) return;
    if (isPlaying) {
      await sound.pauseAsync();
    } else {
      await sound.playAsync();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleRepeatMode = async () => {
    setRepeatMode((prev) => {
      const newRepeatMode = !prev;
      return newRepeatMode;
    });
  };

  return (
    <View style={styles.container}>
      {/* Player Section */}
      <View style={styles.playerContainer}>
        {/* Current Song Info */}
        <View style={styles.songInfoContainer}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {selectedSong?.title || "No song selected"}
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <Slider
            style={styles.slider}
            value={progress}
            minimumValue={0}
            maximumValue={1}
            minimumTrackTintColor="#4A90E2"
            maximumTrackTintColor="#E0E0E0"
            thumbTintColor="#4A90E2"
            onSlidingStart={handleSliderChangeStart}
            onSlidingComplete={handleSliderChangeEnd}
          />
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={toggleRepeatMode}>
            <Ionicons
              name={repeatMode ? "repeat" : "repeat-outline"}
              size={28}
              color={repeatMode ? "#4A90E2" : "#666"}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleGoBack}>
            <Ionicons name="play-skip-back" size={36} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={togglePlayPause}
            style={styles.playButton}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={36}
              color="#FFF"
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleNext}>
            <Ionicons name="play-skip-forward" size={36} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleShuffle}>
            <Ionicons name="shuffle" size={28} color="#666" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.playlistDropdownContainer}>
        <TouchableOpacity
          style={styles.playlistButton}
          onPress={() => setDropdownVisible(!dropdownVisible)}
        >
          <Text style={styles.playlistButtonText}>{selectedPlaylist}</Text>
        </TouchableOpacity>

        {dropdownVisible && (
          <View style={styles.playlistDropdown}>
            {playlists.map((playlist) => (
              <TouchableOpacity
                key={playlist}
                style={styles.playlistItem}
                onPress={() => {
                  setSelectedPlaylist(playlist);
                  setDropdownVisible(false);
                }}
              >
                <Text style={styles.playlistItemText}>{playlist}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.playlistItem}
              onPress={() => {
                setIsCreatingPlaylist(true);
                setDropdownVisible(false);
              }}
            >
              <Text style={styles.playlistItemText}>Create Playlist</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Modal
        visible={isCreatingPlaylist}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCreatingPlaylist(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter playlist name"
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#ccc' }]}
                onPress={() => {
                  setIsCreatingPlaylist(false);
                  setNewPlaylistName('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#4A90E2' }]}
                onPress={() => {
                  if (newPlaylistName.trim() === '') return;
                  const updatedPlaylists = [...playlists, newPlaylistName.trim()];
                  setPlaylists(updatedPlaylists);
                  setSelectedPlaylist(newPlaylistName.trim());
                  setNewPlaylistName('');
                  setIsCreatingPlaylist(false);
                }}
              >
                <Text style={styles.modalButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Songs List */}
      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => playSong(item)}
            style={[
              styles.songItem,
              selectedSong?.id === item.id && styles.selectedSongItem
            ]}
          >
            <Ionicons
              name={selectedSong?.id === item.id ? "musical-notes" : "musical-note"}
              size={24}
              color={selectedSong?.id === item.id ? "#4A90E2" : "#666"}
            />
            <Text
              style={[
                styles.songText,
                selectedSong?.id === item.id && styles.selectedSongText
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 20,
    backgroundColor: '#fff',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  playlistDropdownContainer: {
    paddingHorizontal: 20,
    marginVertical: 10,
  },
  createPlaylistContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  createPlaylistLabel: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistInput: {
    flex: 1,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    backgroundColor: '#fff',
  },
  addButton: {
    marginLeft: 8,
    backgroundColor: '#4A90E2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  playlistButton: {
    padding: 12,
    backgroundColor: '#f2f2f2',
    borderRadius: 8,
  },
  playlistButtonText: {
    fontSize: 16,
    color: '#333',
  },
  playlistDropdown: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  playlistItem: {
    padding: 12,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  playlistItemText: {
    fontSize: 16,
    color: '#333',
  },
  playerContainer: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },
  songInfoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  songTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  progressContainer: {
    marginBottom: 25,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -10,
  },
  timeText: {
    fontSize: 12,
    color: "#666",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  playButton: {
    backgroundColor: "#4A90E2",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },
  listContainer: {
    paddingBottom: 20,
  },
  songItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },
  selectedSongItem: {
    backgroundColor: "#F5F9FF",
  },
  songText: {
    fontSize: 16,
    color: "#333",
    marginLeft: 15,
    flex: 1,
  },
  selectedSongText: {
    color: "#4A90E2",
    fontWeight: "600",
  },
});