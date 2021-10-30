const mongoose = require('mongoose');
require("dotenv").config();
mongoose.connect(process.env.MONGODB_HOST, {useNewUrlParser: true, useUnifiedTopology: true});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'FUCK:')); // gonna keep that fuck in. 16.9.2021 12.30 EEST
var User
db.once('open', function() {
	const userSchema = new mongoose.Schema({
		id: String,
		saveData: Object
	});
	User = mongoose.model('User', userSchema);
});

function findOrCreate(profile, callback) {
	User.countDocuments({id:profile.id},function(err, res){
		if(err) {
			callback(500)
			return console.log(err)
		}
		if (res) {
			return User.findOne({id:profile.id}, function(err, user) {
				if(!err) callback(user)
				if(err) console.log(err)
			})
		} else {
			let user = new User({
				id: profile.id,
				saveData: {
					asdf: "asdf"
				}
			})
			user.save(function (err, user) {
				if (err) {
					callback(500);
					return console.error(err)
				}
				callback(user)
			});
		}
	})
}

function deleteUser(profile, callback) {
	User.deleteOne({id:profile.id}, function(err, res) {
		if(err) {
			callback(500)
			return console.error(err); //i might look for a js debugger :D > doesnt support virtual workspaces
		}
		callback("deleted")
	})
}

module.exports = {
	findOrCreate: findOrCreate,
	deleteUser: deleteUser
}