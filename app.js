var express = require('express'),
    app = express(),
    http = require('http'),
    // server = http.createServer(app),
    cluster = require('cluster'),
    // server = require('http').createServer(app),
    // io = require('socket.io').listen(server),
    // redis = require('redis'),
    // client = redis.createClient(),
    nicknames = [];

var redisAdapter = require('socket.io-redis');
var sticky = require('sticky-session');
var port = process.env.PORT || 5000;
var workers = 3;

if (process.env.REDISTOGO_URL) {
// inside if statement
  var rtg   = require("url").parse(process.env.REDISTOGO_URL);
  var redis = require("redis").createClient(rtg.port, rtg.hostname);

  redis.auth(rtg.auth.split(":")[1]);  
} else {
    var redis = require("redis").createClient();
}

///////////////////////////////////
//      HTTP SERVER
///////////////////////////////////

// Configure sticky sessions to ensure requests go to the same child in the cluster.
// See : https://github.com/indutny/sticky-session

// NOTE: Sticky sessions are based on a hash of the IP address. 
// This means multiple web browsers or tabs on the same machine will always hit the same slave.

sticky(workers, function() {

  // This code will be executed only in slave workers
  var server = http.createServer(app);

  var io = require('socket.io')(server);

  // configure socket.io to use redis adapter
  addRedisAdapter(io);

  // configure socket.io to respond to certain events
  addIOEventHandlers(io);

  return server;

}).listen(port, function() {

  // this code is executed in both slaves and master
  console.log('server started on port '+port+'. process id = '+process.pid);

});
//---------

///////////////////////////////////
//      REDIS ADAPTER
///////////////////////////////////

function addRedisAdapter(io) {
  var redisUrl = process.env.REDISTOGO_URL || 'redis://127.0.0.1:6379';
  var redisOptions = require('parse-redis-url')(redis).parse(redisUrl);
  var pub = redis.createClient(redisOptions.port, redisOptions.host, {
    detect_buffers: true,
    auth_pass: redisOptions.password
  });
  var sub = redis.createClient(redisOptions.port, redisOptions.host, {
    detect_buffers: true,
    auth_pass: redisOptions.password
  });

  io.adapter(redisAdapter({
    pubClient: pub,
    subClient: sub
  }));
  console.log('Redis adapter started with url: ' + redisUrl);
}


redis.SMEMBERS("nickname", function(err, names){
   nicknames = names;
});

// server.listen(3000);


app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.use(express.static(__dirname + '/public'));


console.log("http server listening on %d", port);

// var wss = new WebSocketServer({server: server});
// console.log("websocket server created");


function addIOEventHandlers(io) {
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
}
