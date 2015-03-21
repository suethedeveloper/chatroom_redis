var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    redis = require('redis'),
    client = redis.createClient(),
    nicknames = [];

client.SMEMBERS("nickname", function(err, names){
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
      client.SMEMBERS('names', function(err, names){
        names.forEach(function(name){
          io.sockets.emit('add chatter', name);
        });
      });
      
      client.sadd("nickname", name);
      socket.nickname = name;
      updateNicknames();
    }
  });

  function updateNicknames(){
    client.SMEMBERS("nickname", function(err, names){
        io.sockets.emit('usernames', names);
    });
  }

  socket.on('send message', function(data){
    io.sockets.emit('new message', {msg: data, nick: socket.nickname});
  });

  socket.on('disconnect', function(data){
    if (!socket.nickname) return; //user leaves without entering username
    socket.broadcast.emit("remove chatter", socket.nickname);
    client.SREM("nickname", socket.nickname);
    updateNicknames();
  });

});
