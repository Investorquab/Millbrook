import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Title } from "./screens/Title";
import { Placeholder } from "./screens/Placeholder";

const router = createBrowserRouter([
  { path: "/", element: <Title /> },
  { path: "/play", element: <Placeholder title="In the town" blurb="The 3D town and HUD land here next — hire a worker, set a price, and watch the first day's sales." /> },
  { path: "/signin", element: <Placeholder title="Sign in" blurb="Email and a username, no wallet. A magic link creates your NEAR sub-account behind the scenes." /> },
  { path: "/host", element: <Placeholder title="Host a room" blurb="Create a room, share a code and invite link, pick the speed and goal card, and start when friends join." /> },
  { path: "/join", element: <Placeholder title="Join with a code" blurb="Enter a room code to land in the lobby and wait for the host to let you in." /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
