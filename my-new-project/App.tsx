import { StatusBar } from "expo-status-bar";
import BottomTabNavigator from "./src/navigation/BottomTabNavigator"; // Your main navigator
import Aptabase from "@aptabase/react-native";
Aptabase.init("A-EU-7929124014");


export default function App() {
  return (
    <>
      <BottomTabNavigator />
      <StatusBar style="auto" />
    </>
  );
}
