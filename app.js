var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    // redis = require('redis'),
    // client = redis.createClient(),
    nicknames = [];


if (process.env.REDISTOGO_URL) {
// inside if statement
  var rtg   = require("url").parse(process.env.REDISTOGO_URL);
  var redis = require("redis").createClient(rtg.port, rtg.hostname);

  redis.auth(rtg.auth.split(":")[1]);  
} else {
    var redis = require("redis").createClient();
}


redis.SMEMBERS("nickname", function(err, names){
   nicknames = names;
});

server.listen(3000);

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.use(express.static(__dirname + '/public'));

io.sockets.on('connection', function(socket){
  socket.on('join', function(name, callback){
    if (nicknames.indexOf(name) != -1){
      callback(false);
    } else {
      callback(true);
      socket.broadcast.emit("add chatter", name);
      redis.SMEMBERS('names', function(err, names){
        names.forEach(function(name){
          io.sockets.emit('add chatter', name);
        });
      });
      
      redis.sadd("nickname", name);
      socket.nickname = name;
      updateNicknames();
    }
  });

  function updateNicknames(){
    redis.SMEMBERS("nickname", function(err, names){
        io.sockets.emit('usernames', names);
    });
  }

  socket.on('send message', function(data){
    io.sockets.emit('new message', {msg: data, nick: socket.nickname});
  });

  socket.on('disconnect', function(data){
    if (!socket.nickname) return; //user leaves without entering username
    socket.broadcast.emit("remove chatter", socket.nickname);
    redis.SREM("nickname", socket.nickname);
    updateNicknames();
  });

});
