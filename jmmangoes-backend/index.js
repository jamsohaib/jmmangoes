const express = require('express');
const cors = require('cors');
require('dotenv').config();
const {connectToMongoDB} = require("./connectDB");
const logger = require('./utils/logger');
const requestLogger = require('./middleware/requestLogger');

const jmm_route = require('./routes/jmmangoesRoutes');

// const corsOptions = {
//     origin: ["http://localhost:5173"],
//     credentials: true
// };

const app = express();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(requestLogger);

app.use( express.static( "public" ) );

const cookieParser = require('cookie-parser');
app.use(cookieParser());



const bodyParser = require('body-parser');


app.use(bodyParser.urlencoded({ extended: true }));


connectToMongoDB();

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err?.message || String(err), stack: err?.stack || '' });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

// app.get("/api",(req,res)=>{
//     res.json( {fruits : ["apple","strawberry", "banana"]});
// })

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

app.use("/api",jmm_route);
