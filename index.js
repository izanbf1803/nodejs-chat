var express = require("express"),
	app = express(),
    nodemailer = require("nodemailer"),
    fs = require("fs"),
	server = require("http").createServer(app),
	io = require("socket.io").listen(server),
    mysql = require("mysql"),
    sha256 = require("sha256"),
    url = require("url"),
    nicknames = [],
    users = {},
    ips = {},
    idsNICK = {},
    idsIP = {};
var ip, query, verify, real = [];

require.extensions['.html'] = function (module, filename) {
    module.exports = fs.readFileSync(filename, 'utf8');
};
var HTMLmail = require("./src/html/email.html");

server.listen(process.env.PORT || 80);

console.log("|--------------|");
console.log("|Server Started|");
console.log("|--------------|");
console.log(getLocalIP()); console.log("");

var connection = mysql.createConnection({
    host: "<HOST>",
    user: "<USER>",
    password: "<PASS>",
});

connection.connect(function(err){
    if(!err){
        console.log("DB connected sucesfully");
        console.log("");console.log("");
    }else{
        console.log("DB connection FAILED:");
        console.log("---"+err+"---");
        connection.end();
    }
});
connection.query("USE <DATABASE>");

var smtpTransport = nodemailer.createTransport("SMTP",{
    host: "smtp.gmail.com",
    secureConnection: false,
    port: 587,
    requiresAuth: true,
    domains: ["gmail.com", "googlemail.com"],
        auth: {
        user: "<EMAIL>",
        pass: "<PASS>"
    }
});

function saveBannList(ip){
    connection.query("INSERT INTO baneados (ip) VALUES  ('"+ip+"')"); 
}

function deleteBanned(ip){
    connection.query("DELETE FROM baneados WHERE ip = '"+ip+"'");
}

app.use(express.static(__dirname + '/src'));

app.get("/", function(req, res){
    var url_parts = url.parse(req.url, true);
    query = url_parts.query;
    if ("code" in query){
        verify = true;
    }

	res.sendFile(__dirname + "/index.html");

    var ipAddr = req.headers["x-forwarded-for"];
    if (ipAddr){
        var list = ipAddr.split(",");
        ipAddr = list[list.length-1];
    } else {
        ipAddr = req.connection.remoteAddress;
    }
    try{
        ip = ipAddr.replace(/:/g,"").replace(/f/g,"");
    }catch(ex){
        console.log(ex);
    }
});

app.all('/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

function getLocalIP(){
    var os = require('os');
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses;
}

function checkConnection(nick, sock){
                if(!nick){
                    io.to(sock).emit("connectionLost");
                }
            }

function updateNicknames(){
    io.sockets.emit("usernames", nicknames);
}

function userConnected(nick){
    io.sockets.emit("alert user connected", nick);
}

function userDisconnected(nick){
    io.sockets.emit("alert user disconnected", nick);
}

io.sockets.on("connection", function(socket){
        real[socket.id] = false;
        io.to(socket.id).emit("verify", socket.id);

        io.to(socket.id).emit("ip", ip);
        socket.on("new user", function(data, callback){
            data.nick = data.nick.replace(/'/g,"").replace(/"/g,"").replace(/\\/g,"");
            connection.query("SELECT * FROM usuarios WHERE user = '"+data.nick+"'", function (error, results, fields) {
                connection.query("SELECT * FROM baneados WHERE ip = '"+ip+"'", function (err, res, fiel) {
                    if(error){console.log(error);}
                    else if (results.length > 0 && data.pass == results[0].pass) {
                        if (results[0].user == data.nick && results[0].pass == data.pass){
                            if (nicknames.indexOf(data.nick) != -1){
                                callback(false);
                            }else{
                                socket.nickname = data.nick;
                                users[socket.nickname] = ip; ips[socket.nickname] = ip;
                                idsIP[ip] = socket.id; idsNICK[socket.nickname] = socket.id;
                                if (res.length == 0 && results[0].banned == 0){
                                    nicknames.push(socket.nickname);
                                    updateNicknames();
                                    userConnected(socket.nickname);
                                    if (data.nick != "ADMIN"){
                                        connection.query("UPDATE usuarios SET ip = '"+ip+"' WHERE user = '"+data.nick+"'");
                                    }
                                } else{
                                    io.to(socket.id).emit("blocked", ip);
                                }
                                callback(true);
                            }
                            console.log("'"+ip+"'  "+socket.nickname+" CONNECTED");
                        }
                    }else{
                        io.to(socket.id).emit("wrongID");
                    }
                });
            });
        });

    socket.on("verify", function(data){
        real[data] = true;
        if (verify == true){
            validate(query.code);
        }
    });

    socket.on("disconnect", function(data){
    if(!socket.nickname) return;
    connection.query("SELECT * FROM baneados WHERE ip = '"+ip+"'", function (err, res, fiel) {
        if (res.length == 0) userDisconnected(socket.nickname);
        nicknames.splice(nicknames.indexOf(socket.nickname), 1);
        updateNicknames();
        console.log("'"+ip+"'  "+socket.nickname+" DISCONNECTED");
        delete users[socket.nickname];
    });
});

	socket.on("send message", function(data){
        var msg = filter(data, socket.nickname);
        console.log("'"+ip+"'"+":::"+socket.nickname+":::"+msg);
        checkConnection(socket.nickname, socket.id);
		io.sockets.emit("new message", {msg: msg.trim(), nick: socket.nickname});
	});

    function filter(data,name){
        var result = data;
        if (name.substring(0, 6) != "ADMIN") result = result.replace(/<script/g,"").replace(/<div/g,"");
        return result;
    }

    socket.on("clear", function(){
        io.sockets.emit("clear");
    });

    socket.on("bann", function(data){
        connection.query("SELECT * FROM baneados WHERE ip = '"+ips[data]+"'", function (error, results, fields) {
            if (results.length == 0){
                io.sockets.emit("kick4bann", ips[data]);
                io.sockets.emit("serverMsg", "<font color='#FF8000'><b>"+data+" ha sido </font><font color='#FF0040'><u>BANEADO</u></b></br></font>");
                saveBannList(ips[data]);
            }
        });
    });

    socket.on("bannip", function(data){
        connection.query("SELECT * FROM baneados WHERE ip = '"+data+"'", function (error, results, fields) {
            if (results.length > 0){
                io.sockets.emit("kick4bann", data);
                io.sockets.emit("serverMsg", "<font color='#FF8000'><b>"+data+" ha sido </font><font color='#FF0040'><u>BANEADO</u></b></br></font>");
                saveBannList(data);
            }
        });
    });

    socket.on("unbann", function(data){
        connection.query("SELECT * FROM baneados WHERE ip = '"+ips[data]+"'", function (error, results, fields) {
            if (results.length > 0){
                io.sockets.emit("serverMsg", "<font color='#01DF3A'><b>"+data+" ha sido <u>perdonado</u></b></br></font>");
                deleteBanned(ips[data]);
            }
        });
    });

    socket.on("unbannip", function(data){
        connection.query("SELECT * FROM baneados WHERE ip = '"+data+"'", function (error, results, fields) {
            if (results.length > 0){
                io.sockets.emit("serverMsg", "<font color='#01DF3A'><b>"+data+" ha sido <u>perdonado</u></b></br></font>");
                deleteBanned(data);
            }
        });
    });

    socket.on("bannuser", function(data){
        connection.query("SELECT * FROM usuarios WHERE user = '"+data+"'", function (error, results, fields) {
            if (results[0].banned == 0){
                io.to(idsNICK[data]).emit("kick4bann", ips[data]);
                io.sockets.emit("serverMsg", "<font color='#FF8000'><b>"+data+" ha sido </font><font color='#FF0040'><u>BANEADO</u></b></br></font>");
                connection.query("UPDATE usuarios SET banned = '"+1+"' WHERE user = '"+data+"'");
            }
        });
    });

    socket.on("unbannuser", function(data){
        connection.query("SELECT * FROM usuarios WHERE user = '"+data+"'", function (error, results, fields) {
            if (results[0].banned == 1){
                io.sockets.emit("serverMsg", "<font color='#01DF3A'><b>"+data+" ha sido <u>perdonado</u></b></br></font>");
                connection.query("UPDATE usuarios SET banned = '"+0+"' WHERE user = '"+data+"'");
            }
        });
    });

    socket.on("kick", function(data){
        if (data in idsNICK){
            io.to(idsNICK[data]).emit("kick");
            io.sockets.emit("serverMsg", "<font color='#FF8000'><b>"+data+" ha sido <u>expulsado</u></b></br></font>");
        }
    });

    socket.on("alertTo", function(data){
        if (data in idsNICK){
            io.to(idsNICK[data]).emit("alertTo");
        }
    });

    socket.on("checkbann", function(data, callback){
        connection.query("SELECT * FROM baneados WHERE ip = '"+ip+"'", function (error, results, fields) {
            if (results.length > 0){
                io.to(socket.id).emit("youarebanned");
            }
        });
    });

    socket.on("register", function(data, callback){ 
        try{
            var emailVeryfied;
            connection.query("SELECT * FROM usuarios WHERE user = '"+data.nick+"'", function (error, results, fields) {
                if (results.length == 0){
                    console.log("++++User: "+data.nick+" added to verify query");
                    callback(true);
                    code=sha256(data.nick+"secret1803");
                    HTMLverify = HTMLmail.replace("_CODE_","chatizan.herokuapp.com?code="+code);
                    var mailOptions={
                        to : data.email,
                        subject : "Registro Chat Izan",
                        html : HTMLverify
                    }
                    smtpTransport.sendMail(mailOptions, function(err, response){
                        if(!err){
                            connection.query("INSERT INTO validate (code, user, pass, email) VALUES  ('"+code+"','"+data.nick+"','"+data.pass+"','"+data.email+"')");
                        }
                    });
                }else{
                    callback("Este usuario ya existe");
                }
            });
        }catch (e){
            console.log(e);
        }
    });

    socket.on("getIP", function(data, callback){
        io.to(socket.id).emit("getIP", ips[data]);
    });

    socket.on("whatsMyIP", function(){
        io.to(socket.id).emit("yourIP", ip);
    });

    socket.on("alertTo", function(data){
        if (data in idsNICK){
            io.to(idsNICK[data]).emit("alertTo");
        }
    });

    socket.on("destroyTo", function(data){
        if (data in idsNICK){
            io.to(idsNICK[data]).emit("destroyTo");
        }
    });

    socket.on("helpPass", function(Hmail, callback){
        connection.query("SELECT * FROM usuarios WHERE correo = '"+Hmail+"'", function (err, results, fiel) {
            if (results.length > 0){
                var text = "Usuario: "+results[0].user+" Contraseña: "+results[0].pass;
                console.log(text);

                var mailOptions={
                to : Hmail,
                subject : "ChatIzan: Recuperación cuenta",
                text : text
                }
                smtpTransport.sendMail(mailOptions, function(err, response){
                    if(err){
                        console.log("ERROR: "+err);
                    }else{
                        console.log("¡¡¡¡¡¡¡¡¡¡¡Message sent: " + response.message);   
                        io.to(socket.id).emit("emailSent", Hmail);
                    }
                });
            }
        });
    });

    function validate(CODE){
        try{
            CODE = CODE.replace(/\\/g,"").replace(/'/g,"").replace(/"/g,"");
            connection.query("SELECT * FROM validate WHERE code = '"+CODE+"'", function (error, results, fields){
                if (results.length > 0){
                    connection.query("SELECT * FROM usuarios WHERE user = '"+results[0].user+"'", function (err, res, fiel){
                        if (res.length == 0){
                            connection.query("INSERT INTO usuarios (user, pass, correo, ip) VALUES ('"+results[0].user+"','"+results[0].pass+"','"+results[0].email+"','"+ip+"')");
                            connection.query("DELETE FROM validate WHERE code = '"+CODE+"'");
                            console.log("---User: "+results[0].user+" registered");
                            io.to(socket.id).emit("alert", "Usuario registrado correctamente!");
                            io.to(socket.id).emit("sendTo", "http://chatizan.herokuapp.com");
                        }else{
                            io.to(socket.id).emit("alert", "¡¡¡¡Error en la validación!!!!");
                        }
                    });
                }
            });
        }catch (ex){}
    }
});