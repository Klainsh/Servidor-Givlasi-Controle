const express = require("express");
const app = express();
const port = 3000;
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcrypt");
const saltRounds = 10;

var email_global = '';

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "usuarios",
});

const db0 = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
});

app.use(express.json());
app.use(cors());

app.post("/login", (req,res) => {
    const email = req.body.email;
    const senha = req.body.senha;

    db.query("SELECT * FROM contas_usuarios WHERE email = ?",[email] ,(err, result) => {
        if(err){
            res.send(err)
        } 
        if(result.length > 0){
            bcrypt.compare(senha, result[0].senha, (erro, result) => {
                if(result){
                    res.send({msg:"Usuário logado com sucesso!"})
                }else{
                    res.send({msg:"A senha está incorreta!"})
                }
                
            });
        }else{
            res.send({msg: "Nenhuma conta encontrada com este email!"})
        }
    })
});

app.post('/pega-id-loja', (req, res) => {
    const email = req.body.email;

    db.query("SELECT * FROM contas_usuarios WHERE email= ?",[email], (error, result) => {
        if(error){
            console.log(error);
            res.send(error)
        }else{
            console.log(result[0])
            res.send(result[0])
        }
    })
})

app.post("/cadastro", (req,res) => {
    email_global = req.body.email;//esse email aqui é global, para poder criar o BD da loja na hora que o usuario faz o cadastro.
    const login = req.body.login;
    const senha = req.body.senha;
    const email = req.body.email;
    const nivel = req.body.nivel;
    const cpf = req.body.cpf;
    //O id_da_loja É AUTO INCREMENT NO BANCO DE DADOS!

    db.query("SELECT * FROM contas_usuarios WHERE email=?", [email], (err,result) => {
        if(err){
            res.send(err);
        }
        if(result.length == 0){
            bcrypt.hash(senha, saltRounds, (erro,hash) => {
                db.query("INSERT INTO contas_usuarios(login,senha,email,nivel,cpf) VALUES (?,?,?,?,?)", [login,hash,email,nivel,cpf], (err,response) => {
                    if(err){
                        res.send(err);
                    }
    
                    res.send({msg: "Cadastrado com sucesso!"});
                    criaDatabaseDaLoja();
                });
            })
        }else{
            res.send({msg: "Já existe uma conta cadastrada com este email!"});
        }       
    });//PARA VALIDAR SE JÁ TEM ALGUM EMAIL IGUAL CADASTRADO NO BD
});

function criaDatabaseDaLoja(){//Essa função só pode ser chamada na hora que o usuario cria a conta.
    db.query("SELECT * FROM contas_usuarios WHERE email= ?",[email_global], (error, result) => {
        if(error){
            console.log(error);
        }else{
            //console.log(result[0].id_da_loja)
            db0.query(`CREATE DATABASE IF NOT EXISTS loja${result[0].id_da_loja}`), function(err, result) {
                if(err){
                    console.log("Erro ao tentar criar Database")
                }else{
                    console.log("Database criada com sucesso!")
                }
            }
        }
    })
}

app.listen(port, () => {
    console.log(`Servidor iniciado na porta: ${port}`)
});