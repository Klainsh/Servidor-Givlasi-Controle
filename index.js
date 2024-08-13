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
                    criaDatabaseDaLoja();//também já cria as tabelas necessárias.
                });
            })
        }else{
            res.send({msg: "Já existe uma conta cadastrada com este email!"});
        }       
    });//PARA VALIDAR SE JÁ TEM ALGUM EMAIL IGUAL CADASTRADO NO BD
});

app.post("/cadastrar-produto", (req,res) => {
    const codigo_produto = req.body.codigo_produto;
    const produto = req.body.produto;
    const tamanho_produto = req.body.tamanho_produto;
    const estoque = req.body.estoque;
    const valor_de_compra = req.body.valor_de_compra;
    const valor_de_venda = req.body.valor_de_venda;
    const sobre_o_produto = req.body.sobre_o_produto;
    const sobre_a_venda = req.body.sobre_a_venda;
    const lucro = req.body.lucro;
    const local_armazenamento = req.body.local_armazenamento;
    const id_da_loja = req.body.id_da_loja;
    console.log(id_da_loja);

    const loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "",
        database: `loja${id_da_loja}`,
    });

    loja.query(`SELECT codigo_produto FROM produtos WHERE codigo_produto=${codigo_produto}`,(error, result) => {
        if(error){
            console.log(`Erro: ${error}`)
            res.send({msg:"Erro"})
        }if(result.length > 0){
            res.send({msg:"Já existe um produto cadastrado com esse código!"})
        }else{
            loja.query("INSERT INTO produtos(codigo_produto, produto, tamanho_produto, estoque, valor_de_compra, valor_de_venda, sobre_o_produto, sobre_a_venda, lucro, local_armazenamento) VALUES (?,?,?,?,?,?,?,?,?,?)",[codigo_produto, produto, tamanho_produto, estoque, valor_de_compra, valor_de_venda, sobre_o_produto, sobre_a_venda, lucro, local_armazenamento],(error) => {
                if(error){
                    console.log("Ocorreu um erro ao tentar cadastrar o produto.")
                    console.log(error)
                    res.send({msg:"Erro"})
                }else{
                    console.log(`Novo produto cadastrado com sucesso na loja: ${id_da_loja}`)
                    res.send({msg: "Cadastrado com sucesso!"})
                }
            })
        }
    })
})

app.post("/buscar-produto", (req,res) => {



    //COMEÇAR A FAZER O VALIDADOR PARA SE NO CÓDIGO DO PRODUTO TIVER LETRAS E NÚMEROS, ELE PROCURAR POR NOME!


    const codigoProduto = req.body.codigoProduto;
    const id_da_loja = req.body.id_da_loja;
    const loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "",
        database: `loja${id_da_loja}`,
    });

    //Código para verificar os caracteres da lista
    var lista = [1,2,3,4,5,6,7,8,9,0]
    temNumero = false
    temLetra = false
    //Esse for é para pegar os caracteres do codigoProduto
    //BUSCA O PRODUTO PELO CÓDIGO
    for(n = 0; n < lista.length; n++ ){     
        for(i = 0; i < codigoProduto.length; i++){
            if(codigoProduto[i] == lista[n]){
                console.log(`Tem número: ${codigoProduto[i]}`)
                res.send({msg:"Tem número!"})
                temNumero = true //envia o true para parar o outro for
                loja.query(`SELECT * FROM produtos WHERE codigo_produto=?`,[codigoProduto], (error, result) => {
                    if(error){
                        console.log(error)
                    }else{
                        console.log(result[0].produto)
                    }
                })
                break;
            }else{
                temLetra = true
            }
        }


        //TENHO QUE VER A MELHOR FORMA AINDA DE FAZER ESSA MERDA!

        //se apanhou true e teve um break no outro for, faz break a este tambem
        if(temNumero && temLetra){
            //BUSCA O PRODUTO POR NOME
            break;
        }else{

        }
    }

    //Busca o produto pelo nome!
    if(temNumero === false){
        res.send({msg:"NÃO tem número!"})

        loja.query(`SELECT * FROM produtos WHERE produto LIKE ?`,[`%${codigoProduto}%`], (error, result) => {
            if(error){
                console.log(error)
            }else{
                console.log(result[0].produto)         
            }
        })
    }
    



    
})

async function criaDatabaseDaLoja(){//Essa função só pode ser chamada na hora que o usuario cria a conta.
    db.query("SELECT * FROM contas_usuarios WHERE email= ?",[email_global], (error, result) => {
        if(error){
            console.log(error);
        }else{
            //console.log(result[0].id_da_loja)
            db0.query(`CREATE DATABASE IF NOT EXISTS loja${result[0].id_da_loja}`,(err) => {
                if(err){
                    console.log("Erro ao tentar criar Database")
                }else{
                    console.log("Database criada com sucesso!")
                    id_Da_Loja_Global = result[0].id_da_loja;//passo o id da loja pra var global(usar pra criar a table)        
                    //acessa o banco de dados da loja.
                    const loja1 = mysql.createPool({
                        host: "localhost",
                        user: "root",
                        password: "",
                        database: `loja${result[0].id_da_loja}`,//botar a database da loja.
                    })
                    
                    //CRIA A TABELA DE PRODUTOS DA LOJA.
                    loja1.query(`CREATE TABLE IF NOT EXISTS produtos(
                                codigo_produto INT NOT NULL,
                                produto VARCHAR(100) NOT NULL,
                                tamanho_produto VARCHAR(11) NOT NULL,
                                estoque INT(11) NOT NULL,
                                valor_de_compra FLOAT NOT NULL,
                                valor_de_venda FLOAT NOT NULL,
                                sobre_o_produto FLOAT NOT NULL,
                                sobre_a_venda FLOAT NOT NULL,
                                lucro FLOAT NOT NULL,
                                local_armazenamento VARCHAR(50) NULL,
                                PRIMARY KEY(codigo_produto)
                            )ENGINE=INNODB default charset = utf8;`,(erro) => {
                                if(erro){
                                    console.log("Não foi possível criar a tabela de produtos!")
                                    console.log(erro)
                                }else{
                                    console.log("Table produtos criada com sucesso!")
                                }
                            })
                }
            })
        }
    })
}

function criaTableProdutos(){
    console.log(`iD DA LOJA NO CRIA TABLE: ${id_Da_Loja_Global}`)
    loja.query(`CREATE TABLE IF NOT EXISTS produtos(
                codigo_produto INT NOT NULL,
                produto VARCHAR(100) NOT NULL,
                tamanho_produto VARCHAR(11) NOT NULL,
                estoque INT(11) NOT NULL,
                valor_de_compra FLOAT NOT NULL,
                valor_de_venda FLOAT NOT NULL,
                sobre_o_produto FLOAT NOT NULL,
                sobre_a_venda FLOAT NOT NULL,
                lucro FLOAT NOT NULL,
                local_armazenamento VARCHAR(50) NULL,
                PRIMARY KEY(codigo_produto)
            )ENGINE=INNODB default charset = utf8;`,(err) => {
                if(err){
                    console.log("Não foi possível criar a tabela de produtos!")
                }
            })
}

app.listen(port, () => {
    console.log(`Servidor iniciado na porta: ${port}`)
});