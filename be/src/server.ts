import express from "express";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import cors from "cors"; // Import the CORS middleware
import { auth } from "./lib/auth";
const app = express();
const port = 3005;

app.use(
  cors({
    origin: "http://localhost:3000", // Replace with your frontend's origin
    methods: ["GET", "POST", "PUT", "DELETE"], // Specify allowed HTTP methods
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  })
);

// app.all("/api/auth/*", toNodeHandler(auth)); // For ExpressJS v4
app.all("/api/auth/*splat", toNodeHandler(auth)); // For ExpressJS v5 

// Mount express json middleware after Better Auth handler
// or only apply it to routes that don't interact with Better Auth

app.get("/api/me", async (req, res) => {
 	const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
  console.log("hit")
  return res.json(session);
});









app.use(express.json());
app.listen(port, () => {
	console.log(`Example app listening on port ${port}`);
});