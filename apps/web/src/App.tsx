import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Title } from "./screens/Title";
import { SignIn } from "./screens/SignIn";
import { Hub } from "./screens/Hub";
import { Town } from "./screens/Town";
import { Resident } from "./screens/Resident";
import { Proof } from "./screens/Proof";
import { FastForward } from "./screens/FastForward";
import { Gazette } from "./screens/Gazette";
import { Scoreboard } from "./screens/Scoreboard";
import { SoloProvider } from "./game/SoloProvider";
import { Placeholder } from "./screens/Placeholder";

const router = createBrowserRouter([
  { path: "/", element: <Title /> },
  { path: "/signin", element: <SignIn /> },
  { path: "/hub", element: <Hub /> },
  { path: "/play", element: <Town /> },
  { path: "/lobby", element: <Placeholder title="Room lobby" blurb="Share the code and invite link, fill the four workshops, pick speed and goal card, and start when friends join." /> },
  { path: "/host", element: <Placeholder title="Host a room" blurb="Create a room, share a code and invite link, pick the speed and goal card, and start when friends join." /> },
  { path: "/join", element: <Placeholder title="Join with a code" blurb="Enter a room code to land in the lobby and wait for the host to let you in." /> },
  { path: "/resident", element: <Resident /> },
  { path: "/proof", element: <Proof /> },
  { path: "/gazette", element: <Gazette /> },
  { path: "/fast-forward", element: <FastForward /> },
  { path: "/scoreboard", element: <Scoreboard /> },
]);

export function App() {
  return (
    <SoloProvider>
      <RouterProvider router={router} />
    </SoloProvider>
  );
}
