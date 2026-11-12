import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Title } from "./screens/Title";
import { SignIn } from "./screens/SignIn";
import { AuthVerify } from "./screens/AuthVerify";
import { Hub } from "./screens/Hub";
import { Town } from "./screens/Town";
import { Resident } from "./screens/Resident";
import { Proof } from "./screens/Proof";
import { FastForward } from "./screens/FastForward";
import { Gazette } from "./screens/Gazette";
import { Scoreboard } from "./screens/Scoreboard";
import { Market } from "./screens/Market";
import { Room } from "./screens/Room";
import { Join } from "./screens/Join";
import { SoloProvider } from "./game/SoloProvider";
import { RoomProvider } from "./game/RoomProvider";
import { AuthProvider } from "./game/AuthProvider";

const router = createBrowserRouter([
  { path: "/", element: <Title /> },
  { path: "/signin", element: <SignIn /> },
  { path: "/auth/verify", element: <AuthVerify /> },
  { path: "/hub", element: <Hub /> },
  { path: "/play", element: <Town /> },
  { path: "/room", element: <Room /> },
  { path: "/lobby", element: <Room /> },
  { path: "/join", element: <Join /> },
  { path: "/resident", element: <Resident /> },
  { path: "/proof", element: <Proof /> },
  { path: "/gazette", element: <Gazette /> },
  { path: "/fast-forward", element: <FastForward /> },
  { path: "/scoreboard", element: <Scoreboard /> },
  { path: "/market", element: <Market /> },
]);

export function App() {
  return (
    <AuthProvider>
      <SoloProvider>
        <RoomProvider>
          <RouterProvider router={router} />
        </RoomProvider>
      </SoloProvider>
    </AuthProvider>
  );
}
