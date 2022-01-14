require("dotenv").config();
const pjson = require("./package.json");
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
	if(logfile.length > 0) {
		let newLog = messageLog
		fs.writeFileSync(`${__dirname}/message_log.txt`, "");
		for(let i = 0; i < newLog.length; i++) {
			fs.appendFileSync(`${__dirname}/message_log.txt`, JSON.stringify(newLog[i]) + "\n");
		}
	}
} else {
	fs.writeFileSync(`${__dirname}/message_log.txt`, "");
}
var logStream = fs.createWriteStream("message_log.txt", {flags:'a'});

var key = !process.env.privkey1 ? fs.readFileSync("./privkey1.pem") : process.env.privkey1;
var cert = !process.env.cert1 ? fs.readFileSync("./cert1.pem") : process.env.cert1;
var ca = !process.env.chain1 ? fs.readFileSync("./chain1.pem") : process.env.chain1;
const credentials = {
	key: key,
	cert: cert,
	ca: ca
};
const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);
const { Server } = require("socket.io");
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

app.get('/delete', checkAuth, function(req,res) {
	db.deleteUser(req.user, function(result) {
		if(result == 500) {
			res.redirect('/resources/500.html');
		} else {
			req.logout();
			res.redirect('/resources/deleted.html');
		}
	});
})

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

app.get('/privacy', function(req, res){
	res.redirect('/resources/privacy.html');
});

app.get('/terms', function(req, res){
	res.redirect('/resources/terms.html');
});

app.get("/profile/:pee", function(req, res) {
	switch (req.params.pee) {
		case "rickroll":
			res.redirect("https://adam.omg.lol/")
			break;
		case "125644326037487616":
			res.redirect("https://profile.omg.lol/null");
			break;
		case "708333380525228082":
			res.redirect("https://sus.omg.lol/")
			break;
		case "357156679684718592":
			res.redirect("https://niek.omg.lol/")
			break;
		case "256156118164832257":
			res.redirect("https://stan.omg.lol/")
			break;
		case "845997784607096852":
			res.redirect("https://strixx.omg.lol")
			break;
		case "490664749315653642":
			res.redirect("https://ඞ.omg.lol")
			break;
		case "492647318474981377":
			res.redirect("https://walkx.org")
			break;
		default:
			res.send("This user does not currently have a profile.<br><br><strong>Hello there! Are you a <a href='https://omg.lol'>OMG.LOL</a> customer and want your profile page to go to your OMG.LOL profile?<br>Contact us and we will link up your profile page here.");
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

var admins = ["708333380525228082", "125644326037487616"]
function isAdmin(socket) {
	return socket.request.session.passport.user.flags.includes("admin")|| admins.includes(socket.request.session.passport.user.id);
}

var onlineUsers = [];
var guestUsers = 0;
io.on("connection", (socket) => {
	for(let i = 0; i < messageLog.length; i++) {
		socket.emit("chat message", messageLog[i]);
	}
	if(isAuth(socket)) { 
		onlineUsers.push({name: socket.request.session.passport.user.username, userFlags: socket.request.session.passport.user.flags, id: socket.request.session.passport.user.id}) 
	} else {
		guestUsers++
	}
	let protips = ["Use /notifications to get notifications when you're pinged!", "Check out /help, there might be interesting commands!", "If the tab is unfocused, the tab title shows how many unread messages you have!", "If the tab is unfocused, the tab title shows an exclamation mark when you've been mentioned!", "Use /list to see online users!", "Report bugs to get a bug badge!", "null supports emoticons like :D and :P in chat!", "Use /emojis to see available emojis!"]
	socket.emit("system response", {type: "message", data: `You have connected to null, an experimental chat service from LIT Devs! (<a href='terms'>Terms of Service</a> and <a href='privacy'>Privacy Policy</a>)<br>There are ${onlineUsers.length} online users, and ${guestUsers} guest users. We're currently on ${pjson.friendlyVersion} (${pjson.version}) and more is coming soon!<br><br><i>Pro tip: ${protips[Math.floor(Math.random() * protips.length)]}</i>`});
	socket.on("disconnect", (reason) => {
		if(isAuth(socket)) {
			 onlineUsers.splice(onlineUsers.indexOf({name: socket.request.session.passport.user.username, userFlags: socket.request.session.passport.user.flags, id: socket.request.session.passport.user.id}), 1)
		} else {
			guestUsers -= 1;
		}
	});
	socket.on('chat message', (msg) => {
		
		//if (socket.request.session.passport.user.flags.includes("muted")) return socket.emit("system response", {type: "message", data: "Message not sent: You are muted!"})
		try {
			store.get(socket.request.session.id, (err, res) => {
				if (err) {
					console.log(err);
					return socket.emit("system response", {type: "message", data: "An error occurred - scream at us to check our logs for the reason. In the meantime, try relogging"});
				}
					if(!msg.startsWith("/")) {
						if(res.passport.user.flags.includes("muted")) return socket.emit("system response", {type: "message", data: "Message not sent: You are muted!"})
						if(msg.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().length > 0) {
							msg = msg.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
							let data
							if(msg.length <= 1024) {
								data = {message: msg, user: socket.request.session.passport.user.username, userFlags: socket.request.session.passport.user.flags, userId: socket.request.session.passport.user.id, time: Date.now()}
							} else {
								socket.emit("system response", {type: "message", data: "Message too long or invalid. Please do not abuse null. Sending shortened version..."});
								data = {message: msg.substr(0, 1024), user: socket.request.session.passport.user.username, userFlags: socket.request.session.passport.user.flags, userId: socket.request.session.passport.user.id, time: Date.now()}
							}
							io.emit('chat message', data);
							messageLog.push(data);
							logStream.write(JSON.stringify(data) + "\n");
							if (messageLog.length > 11) messageLog.shift();
						} else {
							socket.emit("system response", {type: "message", data: "Message invalid. Please do not abuse null."});
						}
					} else {
						switch(msg.split(" ")[0]) {
							case "/list":
								socket.emit("system response", {type: "list", data: {users: onlineUsers, guests: guestUsers}});
								break;
							case "/adminreload":
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
							case "/?":
							case "/help":
								let normalCommands = "/list, /help, /emojis, /logout, /notifications, /delete-account"
								if(isAdmin(socket)) {
									socket.emit("system response", {type: "message", data: `Normal commands: ${normalCommands}<br>Admin commands: /broadcast &lt;message&gt;, /adminrefresh, /flag &lt;user id&gt; &lt;flag&gt; &lt;true/false&gt;`})
								} else {
									socket.emit("system response", {type: "message", data: normalCommands})
								}
								break;
							case "/logout":
								socket.emit("system response", {type: "logout", data: null}) // oh my god... well the types are just an arbitrary string so go ahead and add it
								break;
							case "/delete-account":
								socket.emit("system response", {type: "message", data: "<p class='text-red'>Alrighty. If you are <b>absolutely</b> sure you wish to delete your account, click <a href='/delete'>here</a>.<br>There is absolutely <b>NOTHING</b> we can do to reverse this, so do NOT contact us to get your account back!</p>"})
								break;
							case "/flag":
								try {
								if(isAdmin(socket)) {
									
									let args = msg.split(" ");
									if (args.length != 4) {
										socket.emit("system response", {type: "message", data: "Invalid arguments. Usage: /flag userid flag true/false"}); // copilot generated the usage, very nice!
									} else {
									db.userFlag(args[1], args[2], args[3], (err) => {
										if(err) {
											socket.emit("system response", {type: "message", data: "Error: " + err});
										} else {
											socket.emit("system response", {type: "message", data: "Successfully changed flag."});
											store.all((error, sessions) => {
												//looks for a session where session.passport.user.id == args[1]
												for(let i = 0; i < sessions.length; i++) {
													if(!sessions[i].session.passport) continue;
													if(!sessions[i].session.passport.user) continue;
													if(sessions[i].session.passport.user.id == args[1]) {
														let session = sessions[i].session;
														if(args[3] == "true") {
															session.passport.user.flags.push(args[2])
														} else {
															session.passport.user.flags.splice(session.passport.user.flags.indexOf(args[2]), 1)
														}
														store.set(sessions[i]._id, session, function callback(err) {
															if(err) {
																console.log("error: " + err)
																socket.emit("system response", {type: "message", data: "Error: " + err});
															} else {
																io.emit("system response", {type: "refresh", data:null})
															}
														})
													}
												}
											})
										}
									});
								}
								} else {
									socket.emit("system response", {type: "message", data: "You do not have permission to use this command, you sussy baka!"})
								}
								} catch(e) {
									console.log(e);
									socket.emit("system response", {type: "message", data: "Something went wrong here"});
								}
								break;
							case "/mute":
								try {
									if(isAdmin(socket)) {
										
										let args = msg.split(" ");
										if (args.length != 3) {
											socket.emit("system response", {type: "message", data: "Invalid arguments. Usage: /mute userid true/false"}); // copilot generated the usage, very nice!
										} else {
										db.userFlag(args[1], "muted", args[2], (err) => {
											if(err) {
												socket.emit("system response", {type: "message", data: "Error: " + err});
											} else {
												socket.emit("system response", {type: "message", data: "Successfully changed mute status."});
												store.all((error, sessions) => {
													//looks for a session where session.passport.user.id == args[1]
													for(let i = 0; i < sessions.length; i++) {
														if(!sessions[i].session.passport) continue;
														if(!sessions[i].session.passport.user) continue;
														if(sessions[i].session.passport.user.id == args[1]) {
															let session = sessions[i].session;
															if(args[2] == "true") {
																session.passport.user.flags.push("muted")
															} else {
																session.passport.user.flags.splice(session.passport.user.flags.indexOf("muted"), 1)
															}
															store.set(sessions[i]._id, session, function callback(err) {
																if(err) {
																	console.log("error: " + err)
																	socket.emit("system response", {type: "message", data: "Error: " + err});
																} else {
																	if(args[2] == "true") {
																		io.emit("system response", {type: "message", data:`${session.passport.user.username} was muted!`})
																	}
																}
															})
															break;
														}
													}
												})
											}
										});
									}
									} else {
										socket.emit("system response", {type: "message", data: "You do not have permission to use this command, you sussy baka!"})
									}
									} catch(e) {
										console.log(e);
										socket.emit("system response", {type: "message", data: "Something went wrong here"});
									}
									break;	
							default:
								socket.emit("system response", {type: "message", data: "That command does not exist."})
						}
					}
				
			})
		
		} catch(e) {
			console.log(e)
			socket.emit("system response", {type: "message", data: `Looks like youre not logged in, please login. If you are logged in, please relog using /logout ${e}`}) //nobody should ever see this
		}
	});
});
httpServer.listen(process.env.PORT ? process.env.PORT : 80, () => {
	console.log('http running\n');
});

//httpsServer.listen(process.env.PORT ? process.env.PORT : 443, () => {
//	console.log('https running\n');
//});
