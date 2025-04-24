import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import MusicScreen from "../screens/MusicScreen";
import VideoScreen from "../screens/VideoScreen";

const Tab = createBottomTabNavigator();

type TabRoutes = "Music" | "Video";

export default function BottomTabNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => {
          const icons: Record<TabRoutes, keyof typeof Ionicons.glyphMap> = {
            Music: "musical-notes-outline",
            Video: "videocam-outline",
          };

          return {
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={icons[route.name as TabRoutes]} size={size} color={color} />
            ),
            tabBarActiveTintColor: "tomato",
            tabBarInactiveTintColor: "gray",
          };
        }}
      >
        <Tab.Screen name="Music" component={MusicScreen} />
        <Tab.Screen name="Video" component={VideoScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
