import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View, FlatList, TouchableOpacity, Text, Dimensions, AppState } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
import { trackEvent } from "@aptabase/react-native";
import database from '@react-native-firebase/database';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

type VideoFile = {
  id: string;
  title: string;
  uri: string;
  duration: number;
};
const fetchRemoteVideos = async (): Promise<VideoFile[]> => {
  const snapshot = await database().ref('video').once('value');
  const data = snapshot.val();

  if (!data) return [];

  return Object.entries(data)
      .filter(([, val]) => val != null)
      .map(([key, val]) => ({
        id:    key,
        title: (val as any).title || "Untitled",
        uri:   (val as any).uri   || "",
        duration:( val as any).duration || 0,
      }));
};
export default function VideoScreen() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoFile | null>(null);
  const [showControls, setShowControls] = useState(false);
  const appState = useRef(AppState.currentState);
  
  // Initialize player with no source
  // Initialize player with no source
  const player = useVideoPlayer(null, (player) => {
    player.loop = false;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player?.playing });
  useFocusEffect(
    React.useCallback(() => {
      // Screen focused - resume if needed
      return () => {
        // Screen unfocused - pause video
        if (player && player.playing) {
          player.pause();
        }
      };
    }, [player])
  );
  useEffect(() => {
    // Component/Service initialization
    requestPermissions();
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Cleanup on unmount
    return () => {
      releasePlayer();
      subscription.remove();
    };
  }, []);

  const handleAppStateChange = (nextAppState:any) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App coming to foreground
      if (selectedVideo) {
        player.replace(selectedVideo.uri);
        player.pause();
      }
    } else if (nextAppState.match(/inactive|background/)) {
      // App going to background
      if (player?.playing) {
        player.pause();
      }
    }
    appState.current = nextAppState;
  };

  const releasePlayer = async () => {
    try {
      if (player) {
        await player.pause();
        // Note: expo-video's player doesn't have a direct release method
        // The hook should handle cleanup automatically
      }
    } catch (error) {
      console.error('Error releasing player:', error);
    }
  };

  useEffect(() => {
    if (selectedVideo) {
      player.replace(selectedVideo.uri);
      player.pause(); // Ensure video doesn't autoplay
    }
  }, [selectedVideo]);

  const requestPermissions = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') {
      loadVideos();
    } else {
      console.error('Permission denied for media library.');
    }
  };

  const loadVideos = async () => {
    try {
      const localMedia = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: 100,
      });
  
      const localVideos = await Promise.all(
        localMedia.assets.map(async (item) => {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(item.id);
          return {
            id: item.id,
            title: item.filename,
            uri: item.uri,
            duration: assetInfo.duration || 0,
          };
        })
      );
  
      const remoteVideos = await fetchRemoteVideos();
  
      setVideos([...remoteVideos, ...localVideos]);
    } catch (error) {
      console.error('Error loading videos:', error);
    }
  };
  
  const playVideo = (video: VideoFile) => {
    setSelectedVideo(video);
    const videoname = video.title;
    const videolength = video.duration;
    trackEvent("playvideo_title", { videoname, videolength});
    setShowControls(true);
  };

  const togglePlayPause = () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <View style={styles.container}>
      {selectedVideo && player && (
        <TouchableOpacity 
          style={styles.videoContainer}
          activeOpacity={1}
          onPress={toggleControls}
        >
          <VideoView 
            style={styles.videoPlayer} 
            player={player}
            allowsFullscreen 
            allowsPictureInPicture 
          />
          
          {showControls && (
            <TouchableOpacity 
              onPress={togglePlayPause} 
            >
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      )}

      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            onPress={() => playVideo(item)} 
            style={[
              styles.videoItem,
              selectedVideo?.id === item.id && styles.selectedVideoItem
            ]}
          >
            <Ionicons 
              name="videocam" 
              size={24} 
              color={selectedVideo?.id === item.id ? '#FF4757' : '#888'} 
            />
            <View style={styles.videoInfo}>
              <Text 
                style={[
                  styles.videoTitle,
                  selectedVideo?.id === item.id && styles.selectedVideoTitle
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <Text style={styles.videoDuration}>
                {formatDuration(item.duration)}
              </Text>
            </View>
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
    backgroundColor: '#111',
  },
  videoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.9, // 16:9 aspect ratio
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  playButton: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 50,
    padding: 15,
  },
  listContainer: {
    paddingBottom: 20,
  },
  videoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  selectedVideoItem: {
    backgroundColor: '#1E1E1E',
  },
  videoInfo: {
    flex: 1,
    marginLeft: 15,
  },
  videoTitle: {
    color: 'white',
    fontSize: 16,
  },
  selectedVideoTitle: {
    color: '#FF4757',
    fontWeight: 'bold',
  },
  videoDuration: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
});