const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { MongoClient } = require('mongodb'); // NEW: Import MongoClient
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Allow cross-origin requests from your HTML file
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// NEW: MongoDB Connection Setup
const uri = "mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority"; // PASTE YOUR CONNECTION STRING HERE
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let registrationsCollection; // Variable to hold our database collection

// NEW: Connect to the database before starting the server
async function connectToDatabase() {
    try {
        await client.connect();
        const database = client.db("daura_camp"); // Choose a name for your database
        registrationsCollection = database.collection("registrations"); // Choose a name for your collection
        console.log("Connected to MongoDB!");
    } catch (e) {
        console.error("Failed to connect to MongoDB", e);
    }
}
connectToDatabase();

// Paystack Test Secret Key (Do NOT use this in a real application)
const PAYSTACK_SECRET_KEY = 'sk_test_a3d3c8a9a4b3d1b4c5e6f7a8b9c0d1e2f3a4b5c6'; // REPLACE with your LIVE secret key

let umarRoomCounter = 1;
let aishaRoomCounter = 1;

app.post('/register', async (req, res) => {
  let { total_amount, email_address, gender, attendees, payment_method, transfer_ref, payment_reference } = req.body;

  if (total_amount <= 0) {
    return res.status(400).json({ error: 'Total amount must be greater than zero.' });
  }

  if (payment_method === 'online_gateway') {
    try {
      const verificationResponse = await axios.get(`https://api.paystack.co/transaction/verify/${payment_reference}`, {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      });
      
      const verificationData = verificationResponse.data.data;
      if (verificationData.status !== 'success' || verificationData.amount !== total_amount * 100) {
        return res.status(400).json({ error: 'Payment verification failed.' });
      }
      console.log('Payment verified successfully for reference:', payment_reference);
    } catch (error) {
      console.error('Paystack verification error:', error.response ? error.response.data : error.message);
      return res.status(500).json({ error: 'Payment verification failed on the server.' });
    }
  }

  let assignedRoom;
  if (gender === 'male') {
      assignedRoom = `Umar-${umarRoomCounter++}`;
  } else if (gender === 'female') {
      assignedRoom = `Aisha-${aishaRoomCounter++}`;
  } else {
      assignedRoom = `Mixed-Room-${Math.floor(Math.random() * 1000) + 1}`;
  }

  const newRegistration = {
    // NEW: The database will automatically generate an ID, so we don't need a counter here
    timestamp: new Date(),
    email: email_address,
    gender,
    attendees,
    total_amount,
    payment_method,
    payment_status: payment_method === 'bank_transfer' ? 'pending' : 'paid',
    room: assignedRoom,
    transfer_reference: payment_method === 'bank_transfer' ? transfer_ref : payment_reference
  };

  try {
      // NEW: Save the registration to the MongoDB collection
      const result = await registrationsCollection.insertOne(newRegistration);
      console.log('Saved to database with ID:', result.insertedId);

      // Now we can use the database ID as our registration ID
      res.status(200).json({
        message: 'Registration successful',
        registrationId: result.insertedId,
        room: newRegistration.room
      });

  } catch (dbError) {
      console.error('Failed to save registration to database:', dbError);
      res.status(500).json({ error: 'Failed to save registration.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});