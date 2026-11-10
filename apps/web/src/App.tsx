import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Title } from "./screens/Title";
import { SignIn } from "./screens/SignIn";
import { Hub } from "./screens/Hub";
import { Placeholder } from "./screens/Placeholder";

const router = createBrowserRouter([
  { path: "/", element: <Title /> },
  { path: "/signin", element: <SignIn /> },
  { path: "/hub", element: <Hub /> },
  { path: "/play", element: <Placeholder title="In the town" blurb="The 3D town and HUD land here next — hire a worker, set a price, and watch the first day's sales." /> },
  { path: "/lobby", element: <Placeholder title="Room lobby" blurb="Share the code and invite link, fill the four workshops, pick speed and goal card, and start when friends join." /> },
  { path: "/host", element: <Placeholder title="Host a room" blurb="Create a room, share a code and invite link, pick the speed and goal card, and start when friends join." /> },
  { path: "/join", element: <Placeholder title="Join with a code" blurb="Enter a room code to land in the lobby and wait for the host to let you in." /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
