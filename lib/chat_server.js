var socketio = require('socket.io');
const util = require('util')
var io;
var guestNumber = 1;
var nickNames = {};
var namesUsed = [];
var currentRoom = {};

exports.listen = function (server) {
    io = socketio(server); // start socket.io server, allowing it to piggyback on existing HTTP server.
    // io.set('log level', 1);
    io.sockets.on('connection', function (socket) { // define how each user connection will be handled.
        guestNumber = assignGuestName(socket, guestNumber, nickNames, namesUsed); // Assign user a guest name when they connect.

        joinRoom(socket, 'Lobby');

        handleMessageBroadcasting(socket, nickNames); // place user in the Lobby room when they connect.

        handleNameChangeAttempts(socket, nickNames, namesUsed); // handle user messages, name change attempts, and room creation or changes.

        handleRoomJoining(socket);

        socket.on('rooms', function () { // provide user with list of occupied rooms on request.
            socket.emit('rooms', io.sockets.adapter.rooms);
        });

        handleClientDisconnection(socket, nickNames, namesUsed); // define a clean up logic for when user disconnects.
    });
};


function assignGuestName(socket, guestNumber, nickNames, namesUsed) {
    var name = 'Guest' + guestNumber;
    nickNames[socket.id] = name;
    socket.emit('nameResult', {
        success: true,
        name: name
    });
    namesUsed.push(name);
    return guestNumber + 1;
}

function joinRoom(socket, room) {
    socket.join(room); // Make user join room
    currentRoom[socket.id] = room; // assign room to socket.id 
    socket.emit('joinResult', { // let users know they're now in new room.
        room: room
    });
    socket.broadcast.to(room).emit('message', { // let other users in room know that new user has joined.
        text: nickNames[socket.id] + ' has joined ' + room + '.'
    });
    var usersInRoom = io.sockets.adapter.rooms[room]; // determine what other users are in same room as user.
    var numClients = io.sockets.adapter.rooms[room] != undefined ? Object.keys(io.sockets.adapter.rooms[room]).length : 0;
    if (numClients > 1) { // if other users exist summarize who they are.
        var usersInRoomSummary = 'Users currently in ' + room + ': ';
        for (var index in usersInRoom) {
            var userSocketId = usersInRoom[index].id;
            if (userSocketId != socket.id) {
                if (index > 0) {
                    usersInRoomSummary += ', ';
                }
                usersInRoomSummary += nickNames[userSocketId];
            }
        }
        usersInRoomSummary += '.';
        socket.emit('message', { // send summery of other users in the room to the user.
            text: usersInRoomSummary
        });
    }
}

function handleNameChangeAttempts(socket, nickNames, namesUsed) {
    socket.on('nameAttempt', function (name) { // add listener for nameAttempt events.
        if (name.indexOf('Guest') == 0) { // don't allow nicknames to start with Guest.
            socket.emit('nameResult', {
                success: false,
                message: 'Names cannot begin with "Guest".'
            });
        } else {
            if (namesUsed.indexOf(name) == -1) { // if name isn't already registered, register it.
                var previousName = nickNames[socket.id];
                var previousNameIndex = namesUsed.indexOf(previousName);
                namesUsed.push(name);
                nickNames[socket.id] = name;
                delete namesUsed[previousNameIndex]; // remove previouse name to make available for other clients.
                socket.emit('nameResult', {
                    success: true,
                    name: name
                });
                socket.broadcast.to(currentRoom[socket.id]).emit('message', {
                    text: previousName + ' is now known as ' + name + '.'
                });
            } else {
                socket.emit('nameResult', { // send error to client if name is already registered.
                    success: false,
                    message: 'That name is already in use.'
                });
            }
        }
    });
}

function handleMessageBroadcasting(socket) {
    socket.on('message', function (message) {
        socket.broadcast.to(message.room).emit('message', { // can be hacked.
            text: nickNames[socket.id] + ': ' + message.text
        });
    });
}

function handleRoomJoining(socket) {
    socket.on('join', function (room) {
        socket.leave(currentRoom[socket.id]); // note!
        joinRoom(socket, room.newRoom);
    });
}

function handleClientDisconnection(socket) {
    socket.on('disconnect', function () {
        var nameIndex = namesUsed.indexOf(nickNames[socket.id]);
        delete namesUsed[nameIndex];
        delete nickNames[socket.id];
    });
}