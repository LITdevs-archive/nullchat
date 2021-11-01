require("dotenv").config();
const express = require("express");
const app = express();
const passport = require("passport");
const session  = require('express-session')
const DiscordStrategy = require("passport-discord").Strategy;
const MongoDBStore = require("connect-mongodb-session")(session);
const db = require("./db");
var store = new MongoDBStore({
	uri: process.env.MONGODB_HOST,
	collection: 'sessions'
});
passport.serializeUser(function(user, done) {
	done(null, user);
});
passport.deserializeUser(function(obj, done) {
	done(null, obj);
});
var isLocal = false;
var fs = require('fs');
var http = require('http');
var https = require('https');
var messageLog = []
if (fs.existsSync(`${__dirname}/message_log.txt`)) {
	let logfile = fs.readFileSync(`${__dirname}/message_log.txt`).toString().split("\n");
	for (let i = 0; i < 11; i++) {
		if(!logfile[logfile.length -2]) { 
			i = 11
		} else {
			messageLog.push(JSON.parse(logfile[logfile.length - 2]));
			logfile.pop()
		}
	}
	messageLog.reverse()
} else {
	fs.writeFileSync(`${__dirname}/message_log.txt`, "");
}
var logStream = fs.createWriteStream("message_log.txt", {flags:'a'});

var key = !isLocal ? fs.readFileSync("./privkey1.pem") : "";
var cert = !isLocal ? fs.readFileSync("./cert1.pem") : "";
var ca = !isLocal ? fs.readFileSync("./chain1.pem") : "";
const credentials = {
	key: key,
	cert: cert,
	ca: ca
};
const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);
const { Server } = require("socket.io");
const { allowedNodeEnvironmentFlags } = require("process");
const io = new Server(httpServer);
io.use(function(socket, next){
	// Wrap the express middleware
	sessionMiddleware(socket.request, {}, next);
})
passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
	callbackURL: !isLocal ? "https://null.omg.lol/oauthcallback" : "http://localhost/oauthcallback",
    scope: ["identify"]
},
function(accessToken, refreshToken, profile, cb) {
    db.findOrCreate(profile, function(res) {
		if (res == 500) { // If something goes wrong in finding/creating the user, db.js will return 500
			cb("Interal Server Error: Database failure", null)
		} else {
			cb(null, res)
		}
	})
}));
var sessionMiddleware = session({
	secret: process.env.SESSION_SECRET,
	resave: true,
	saveUninitialized: true,
	store: store
})
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use("/resources", express.static('public/resources'))
app.use(express.urlencoded({extended:true}));


app.get("/", (req, res) => {	
	res.render(`${__dirname}/public/index.ejs`, {user: req.user ? req.user : null});
});

app.get('/login', function(req, res) {
	if (req.isAuthenticated()) return res.redirect('/');
	res.render(`${__dirname}/public/login.ejs`, {redirect: req.session.redirectTo != undefined && req.session.redirectTo.length > 1 ? true : false});
});

app.get('/oauth', passport.authenticate('discord', {scope: ['identify']}), function(req, res) {});

app.get('/oauthcallback', passport.authenticate('discord', { failureRedirect: '/500.html'}), function(req, res) { 
	if(req.session.redirectTo) {
		let dest = req.session.redirectTo; 
		req.session.redirectTo = "/"
		res.redirect(dest) 
	} else {
		res.redirect('/')
	}
});

app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/');
});

app.get("/profile/:pee", function(req, res) {
	switch (req.params.pee) {
		case "rickroll":
			res.redirect("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
			break;
		default:
			res.render(`${__dirname}/public/404.ejs`);
			break;
	}
});


function checkAuth(req, res, next) {
	if (req.isAuthenticated()) return next();
	req.session.redirectTo = req.path;
	res.redirect(`/login`)
}

//app.get('*', function(req, res){
//	res.status(404).render(`${__dirname}/public/404.ejs`);
//});
function isAuth(socket) {
	return socket.request.session.passport && socket.request.session.passport.user;
}

var admins = ["125644326037487616", "708333380525228082"]
function isAdmin(socket) {
	return admins.includes(socket.request.session.passport.user.id);
}

var onlineUsers = [];
io.on("connection", (socket) => {
	for(let i = 0; i < messageLog.length; i++) {
		socket.emit("chat message", messageLog[i]);
	}
	if(isAuth(socket)) onlineUsers.push({name: socket.request.session.passport.user.username, id: socket.request.session.passport.user.id});
	socket.on("disconnect", (reason) => {
		if(isAuth(socket)) onlineUsers.splice(onlineUsers.indexOf({name: socket.request.session.passport.user.username, id: socket.request.session.passport.user.id}), 1)
	  });
	socket.on('chat message', (msg) => {
		try {
		if(!msg.startsWith("/")) {
			if(msg.trim().length > 0) {
				let data = {message: msg, user: socket.request.session.passport.user.username, userId: socket.request.session.passport.user.id}
				io.emit('chat message', data);
				messageLog.push(data);
				logStream.write(JSON.stringify(data) + "\n");
				if (messageLog.length > 11) messageLog.shift();
			}
		} else {
			switch(msg.split(" ")[0]) {
				case "/list":
					socket.emit("system response", {type: "list", data: onlineUsers})
					break;
				case "/adminrefresh":
					if(isAdmin(socket)) {
						io.emit("system response", {type: "refresh", data: null})
					} else {
						socket.emit("system response", {type: "message", data: "You do not have permission to use this command, you sussy baka!"})
					}
					break;
				case "/broadcast":
					if(isAdmin(socket)) {
						io.emit("system response", {type: "adminmessage", data: msg.split("broadcast ")[1]})
					} else {
						socket.emit("system response", {type: "message", data: "You do not have permission to use this command, you sussy baka!"})
					}
					break;
				case "/rickrollpeople":
					if(isAdmin(socket)) {
						io.emit("system response", {type: "rickroll", data: null})
					} else {
						socket.emit("system response", {type: "message", data: "You do not have permission to use this command, you sussy baka!"})
					}
					break;
				case "/help":
					if(isAdmin(socket)) {
						socket.emit("system response", {type: "message", data: "/list, /broadcast <message>, /rickrollpeople, /adminrefresh"})
					} else {
						socket.emit("system response", {type: "message", data: "/list"})
					}
					break;
				default:
					socket.emit("system response", {type: "message", data: "That command does not exist."})
			}
		}
		} catch(e) {
			console.log(e)
			socket.emit("system response", {type: "message", data: e})
		}
	});
});
httpServer.listen(80, () => {
	console.log('http running\n');
});

httpsServer.listen(443, () => {
	console.log('https running\n');
});
