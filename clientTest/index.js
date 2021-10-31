const { io } = require("socket.io-client");
const socket = io("http://null.omg.lol");
setTimeout(() => {
  socket.emit("pissjar", "aiowjfiopawejf")
}, 1000);