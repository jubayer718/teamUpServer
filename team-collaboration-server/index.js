const express = require('express')
const cors = require('cors')
const http = require("http");
const { Server } = require("socket.io");
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


const app = express()
const port = process.env.PORT || 5000

// Middleware
app.use(cors());
app.use(express.json());

// HTTP Server for Socket.io
const server = http.createServer(app);
// ✅ WebSocket Server CORS 
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// MongoDB Connection
const uri = `mongodb+srv://teamCollaboration:${process.env.DB_PASS}@cluster0.jo0u1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Run MongoDB Connection
async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");




    // Define MongoDB Collection
    const userCollection = client.db("collaborationDB").collection("users");
    const messageCollection = client.db("collaborationDB").collection("messages");
    const chatsCollection = client.db("collaborationDB").collection("chats");
    const taskCollection = client.db("collaborationDB").collection("task");
    const projectCollection = client.db("collaborationDB").collection("projects");

    // monitoring MongoDB Change Stream
    const changeStream = taskCollection.watch();
    changeStream.on("change", (change) => {
      // console.log("detect database changes:", change);

      if (change.operationType === "insert") {
        io.emit("task_added", change.fullDocument);
      } else if (change.operationType === "update") {
        io.emit("task_updated", { _id: change.documentKey._id, ...change.updateDescription.updatedFields });
      } else if (change.operationType === "delete") {
        io.emit("task_deleted", change.documentKey._id);
      }
    });






    app.post('/task', async (req, res) => {
      const task = req.body;
      const result = await taskCollection.insertOne(task);
      res.send(result)
    })

    app.get('/allTask/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await taskCollection.find(query).toArray();
      // console.log(result);
      res.send(result);
    })


    app.delete("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.deleteOne(query);
      res.send(result)
    })

    app.get("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.findOne(query);
      res.send(result)
    })

    app.put('/tasks/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          condition: 'completed'
        }
      }
      const result = await taskCollection.updateOne(filter, updatedDoc);
      console.log(result);
      res.send(result)
    })


    //project related API's

    app.post('/projects', async (req, res) => {
      const data = req.body;
      const result = await projectCollection.insertOne(data);
      res.send(result);
    })
    app.get('/projects', async (req, res) => {

      const result = await projectCollection.find().toArray();
      res.send(result)
    })

    app.delete('/projects/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await projectCollection.deleteOne(query);
      res.send(result)
    })

    app.patch('/projects/approve/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: 'approved'
        }
      }
      const result = await projectCollection.updateOne(query, updatedDoc);
      res.send(result);
    })
    app.put('/projects/decline/:id', async (req, res) => {
      const data = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: 'declined',
          declineCause: data,
        }
      }
      const result = await projectCollection.updateOne(query, updatedDoc);
      res.send(result);
    })

    // API Route to Add Users
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exist' })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.get('/allUser', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })
    app.put('/make-admin/:email', async (req, res) => {
      const email = req.params;
      const filter = { email: email };
      const updatedDoc = {
        $set: {
          admin: true
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.get('/user/admin/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    })

    // messages related api
    app.post("/messages", async (req, res) => {
      const message = req.body;
      const result = await messageCollection.insertOne(message);
      res.send(result);
    })

    //One to One chat APIs

    app.post('/chats', async (req, res) => {
      const chats = req.body;
      const result = await chatsCollection.insertOne(chats);
      res.send(result)

    })

    app.get('/allChats', async (req, res) => {

      const result = await chatsCollection.find().toArray();
      res.send(result);
    });


    const userSocketMap = {};
    const getAllConnectedClients = (roomId) => {
      return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
        return {
          socketId,
          username: userSocketMap[socketId]
        }
      })
    }
    // WebSocket for Real-Time 
    io.on("connection", (socket) => {
      // console.log(`User connected: ${socket.id}`);

      socket.on("join", ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        console.log(clients);
        clients.forEach(({ socketId }) => {
          io.to(socketId).emit("joined", {
            clients,
            username,
            socketId: socket.id,

          })
        })
      })

      socket.on("code-change", ({ roomId, code }) => {
        socket.in(roomId).emit("code-change",{code})
      })

      socket.on("sync-code", ({ socketId, code }) => {
        io.to(socketId).emit("code-change", { code });
      })
      socket.on("disconnecting", () => {
        const rooms = [...socket.rooms];
        
       rooms.forEach((roomId) => {
         socket.in(roomId).emit("disconnected", {
           socketId: socket.id,
           username: userSocketMap[socket.Id]
         })
       })
        delete userSocketMap[socket.id];
        socket.leave()
       
     });

     


      //one to one chat message functionality
      socket.on("chat", async (chat) => {
        io.emit("chat", chat);

      })

      //group discussion

      socket.on("joinChat", async () => {
        try {
          const messages = await messageCollection.find().sort({ timestamp: 1 }).toArray();
          socket.emit("previousMessages", messages); // Send chat history


        } catch (error) {
          console.error("Error fetching messages:", error);
        }
      })





      // Listen for messages from clients
      socket.on("sendMessage", async (data) => {
        try {
          const result = await messageCollection.insertOne(data);
          if (result.acknowledged) {
            io.emit("receiveMessage", data); // Broadcast the message to all users
          }
        } catch (error) {
          console.error("Error saving message:", error);
        }

        // console.log("Message received:", data);

        // io.emit("receiveMessage", data); // Broadcast message to all users
      });


      socket.on("update_task", async ({ taskId, status }) => {
        await taskCollection.updateOne(
          { _id: new ObjectId(taskId) },
          { $set: { status } }
        );
      });


      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
      });
    });

  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}
run();


// API Endpoint
app.get('/', (req, res) => {
  res.send('Team collaboration is running now');
});

// Start Server (Use `server.listen` instead of `app.listen`)
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
