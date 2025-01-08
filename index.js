const express = require("express");
const app = express();
const port = 3000;
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcrypt");
const saltRounds = 10;

var email_global = '';
var id_Da_Loja_Global ='';

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
    contaNumeros = 0 //faz a contagem para verificar quantos números tem no código que o usuario enviou!
    //vALIDA CARACTERES
    //Verifica se tem números no código enviado, se tiver ele conta quantos tem!
    for(n = 0; n < codigoProduto.length; n++){
        for(i = 0; i < lista.length; i++){          
            if(codigoProduto[n] == lista[i]){
                contaNumeros ++
            }
        }
    }

    
    //Executa as ações baseadas na demanda.
    if(contaNumeros == codigoProduto.length){ //Caso tenha apenas números no código, busca pelo código.
        loja.query(`SELECT * FROM produtos WHERE codigo_produto=?`,[codigoProduto], (error, result) => {
            if(error){
                res.send({msg:"Ocorreu um erro ao tentar buscar o produto desejado!"})
                console.log(error)
            }else{
                if(result.length > 0){
                    res.send([{ codigo_produto: result[0].codigo_produto, produto: result[0].produto, preco: result[0].valor_de_venda, estoque: result[0].estoque },])  
                    //console.log({ codigo_produto: result[0].codigo_produto, produto: result[0].produto, preco: result[0].valor_de_venda, estoque: result[0].estoque },)
                }else{
                    res.send({msg:"Nenhum resultado encontrado!"})
                    console.log("Nenhum resultado encontrado!")
                }  
            }
        })
    }else if(contaNumeros == 0){ //Caso não tenha números, busca pelo nome.
        //res.send({msg:"Busca o produto pelo nome!"})
        loja.query(`SELECT * FROM produtos WHERE produto LIKE ?`,[`%${codigoProduto}%`], (error, result) => {
            if(error){
                res.send({msg:"Ocorreu um erro ao tentar buscar o produto desejado!"})
                console.log(error)
            }else{
                //LISTA COM OS PRODUTOS ENCONTRADOS NO BANCO DE DADOS!
                var listaProdutos = [];
                if(result.length > 0){
                    for(r = 0; r < result.length; r++){  
                        //listaProdutos.push(result[r].produto)  //Adiciona cada resultado a listaProdutos
                        listaProdutos.push({ codigo_produto: result[r].codigo_produto, produto: result[r].produto, preco: result[r].valor_de_venda, estoque: result[r].estoque },)
                    }
                    res.send(listaProdutos)  
                    //console.log(listaProdutos)
                }else{
                    console.log("Nenhúm resultado encontrado!")
                    res.send({msg:"Nenhum resultado encontrado!"})
                }                  
            }
        })
    }else{//Em outros casos, busca pelo nome também.
        loja.query(`SELECT * FROM produtos WHERE produto LIKE ?`,[`%${codigoProduto}%`], (error, result) => {
            if(error){
                res.send({msg:"Ocorreu um erro ao tentar buscar o produto desejado!"})
                console.log(error)
            }else{
                //LISTA COM OS PRODUTOS ENCONTRADOS NO BANCO DE DADOS!
                var listaProdutos = [];
                if(result.length > 0){
                    for(r = 0; r < result.length; r++){
                        listaProdutos.push({ codigo_produto: result[r].codigo_produto, produto: result[r].produto, preco: result[r].valor_de_venda, estoque: result[r].estoque },)
                    }    
                    res.send(listaProdutos)  
                    console.log(listaProdutos)
                }else{
                    console.log("Nenhúm resultado encontrado!")
                    res.send({msg:"Nenhum resultado encontrado!"})
                }       
            }
        })
    }
})

/* AREA RESERVADA PARA SALVAR UMAS COISINHAS
        loja.query(`SELECT * FROM produtos WHERE codigo_produto=?`,[codigoProduto], (error, result) => {
            if(error){
                console.log(error)
            }else{
                console.log(result[0].produto)
            }
        })
        break;

        loja.query(`SELECT * FROM produtos WHERE produto LIKE ?`,[`%${codigoProduto}%`], (error, result) => {
            if(error){
                console.log(error)
            }else{
                console.log(result[0].produto)         
            }
        })

    //DO CLIENT:
        //Lista os objetos retornados, exemplo: produto1, produto2, etc...
        for(num=0; num < Object.keys(response.data).length; num++){
            console.log(response.data[(num,num)].name) 

        }

*/

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
                    criaDatabase_Vendas_Da_Loja();//Cria a database que armazena as vendas da loja!   
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

async function criaDatabase_Vendas_Da_Loja(){
    db0.query(`CREATE DATABASE IF NOT EXISTS vendas_loja${id_Da_Loja_Global}`,(err) => {
        if(err){
            console.log("Erro ao tentar criar Database")
        }else{
            console.log("Database de vendas da loja criada com sucesso!")          
        }
    })
}

//TENHO QUE REESTRUTURAR ESSA PORCARIA DEPOIS, CRIAR FUNÕES SEPARADAS PARA O CÓDIGO FICAR MAIS LIMPO.
app.post("/finalizar-venda", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const listaDosProdutosVendidos = req.body.produtos_Vendidos;
    //PARTE EM TESTE------------
    contador = 0;
    const acessa_Database_Vendas_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "",
        database: `vendas_loja${id_da_loja}`,
    });

    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "",
        database: `loja${id_da_loja}`,
    })
    acessa_Database_Vendas_Loja.query(`SHOW TABLES FROM vendas_loja${id_da_loja}`, (err,result) => {
        if(err){
            console.log("Erro ao consultar tabelas de vendas")
        }else{
            //Conta quantas tabelas de vendas tem na loja.
            for(i = 0; i < result.length; i++){
                resultado = result[i][`Tables_in_vendas_loja${id_da_loja}`];
                if(resultado.substr(-8) == dataSistema()){                  
                    contador ++
                }               
            }
            //Retorna o nome a ser usado na próxima tabela.
            var nomeDaTabela = `venda${contador+1}${dataSistema()}`

            //Cria a tabela que vai ficar os dados da venda.
            acessa_Database_Vendas_Loja.query(`CREATE TABLE IF NOT EXISTS ${nomeDaTabela}(
                                                cod_produto int not null,
                                                produto varchar(41) not null,
                                                unidades int not null,
                                                preco float not null)Default charset=utf8;`, (erro) => {
                                                    if(erro){
                                                        console.log(`Erro ao tentar criar tabela da venda ERRO: ${erro}`)
                                                        res.send({msg:"Erro!"})
                                                    }else{
                                                        //Parte que insere os produtos da venda na tabela.
                                                        if(listaDosProdutosVendidos.length != 0){
                                                            for(produtos = 0; produtos < listaDosProdutosVendidos.length; produtos ++){
                                                                acessa_Database_Vendas_Loja.query(`INSERT INTO ${nomeDaTabela} (cod_produto,produto,unidades,   preco) VALUES(${listaDosProdutosVendidos[produtos][0]},'${listaDosProdutosVendidos[produtos][1]}',${listaDosProdutosVendidos[produtos][2]},${listaDosProdutosVendidos[produtos][3]})`, (erro) => {
                                                                    if(erro){
                                                                        console.log(`Erro ao tentar cadastrar os produtos ${erro}`)
                                                                    }
                                                                })
                                                            }   
                                                            //Fim da parte que insere os produtos da venda na tabela.  

                                                            res.send({msg:"Sucesso!"})//Finalizou todo o processo.
                                                        }else{
                                                            res.send({msg:"Erro!"})
                                                        }
                                                        //Fim da parte que insere os produtos na tabela.
                                                    }
            })

            //PARTE QUE REMOVE OS PRODUTOS DO ESTOQUE!
            for(i = 0; i < listaDosProdutosVendidos.length; i++){
                const codigo_Do_Produto = listaDosProdutosVendidos[i][0]
                const nome_Do_Produto_Vendido = listaDosProdutosVendidos[i][1]
                const unidades_Vendidas = listaDosProdutosVendidos[i][2]
                
                acessa_Database_Da_Loja.query(`SELECT * FROM produtos WHERE codigo_produto=${codigo_Do_Produto}`, (error, resultado) => {
                    if(error){
                        console.log(`Não foi possível remover as unidades dos produtos vendidos. Erro: ${error}`)
                        res.send({msg:"Não foi possível remover do estoque os produtos vendidos!"})
                    }else{
                        var subtrai_Estoque = (resultado[0].estoque - unidades_Vendidas)
                        console.log(`Nome do produto vendido: ${nome_Do_Produto_Vendido} Unidades vendidas: ${unidades_Vendidas}`)
                        console.log(`Estoque do produto: ${resultado[0].estoque} Estoque substituído: ${subtrai_Estoque}`)
                        acessa_Database_Da_Loja.query(`UPDATE produtos SET estoque=${subtrai_Estoque} WHERE codigo_produto=${codigo_Do_Produto}`)
                    }
                })
            }
            //FIM DA PARTE QUE REMOVE OS PRODUTOS DO ESTOQUE!
        }      
    })
    //FINAL DA PARTE EM TESTE ---------
})

app.post("/busca-Vendas-Do-Dia", (req,res) => {
    
    const id_da_loja = req.body.id_da_loja;
    const acessa_Database_Vendas_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "",
        database: `vendas_loja${id_da_loja}`,
    });
    
    acessa_Database_Vendas_Loja.query(`SHOW TABLES FROM vendas_loja${id_da_loja}`, (error, result) => {
        if(error){
            console.log("Erro")
            console.log({msg:"Erro"})
        }else{
            var listaDosProdutos = []
            contador = 0
            contador1 = 0
            if(result.length > 0){  //SE TIVER ALGUMA VENDA NO BANCO DE DADOS DA LOJA
                
                //Conta quantas tabelas de vendas tem na loja.
                for(i = 0; i < result.length; i++){
                    const resultado = result[i][`Tables_in_vendas_loja${id_da_loja}`];//RETORNA EX: VENDA107012025
                    
                    if(resultado.substr(-8) == dataSistema()){ //SE TIVER VENDA COM A DATA DE HOJE    
                        contador++
                        acessa_Database_Vendas_Loja.query(`SELECT * FROM ${resultado}`, (err, result2) => {
                            if(err){
                                console.log("Erro")
                            }else{              
                                contador1 ++                 
                                for(a = 0; a < result2.length; a ++){
                                    listaDosProdutos.push({codigoProduto: result2[a].cod_produto, produto: result2[a].produto, unidades: result2[a].unidades, preco: result2[a].preco})     
                                    //listaDosProdutos.push(result2[a].produto)                                        
                                }                                    
                            }
                            if(contador1 == contador){
                                res.send(listaDosProdutos)
                            }
                                                              
                        })
                    } 
                }               
            }else{
                console.log("Nenhuma venda encontrada!")
                res.send({msg:"Nenhuma venda encontrada!"})
            }     
        }

    })
})


function dataSistema(){
    const date = new Date();
    //A data precisou ser tratada pois quando a data é exemplo: 07/01, ele não pega o 0, agora sim está correta! Não mude!
    data = ('0'+date.getDate()).slice(-2) + ('0'+date.getMonth()+1).slice(-2) + (date.getFullYear())
    //var data = (`${date.getDate()}${date.getMonth()+1}${date.getFullYear()}`)
    return data
}

function criaNomeDaTabelaVendaPorData(){
    contador = 1;
    const acessa_Database_Vendas_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "",
        database: `vendas_loja${id_da_loja}`,
    });
    acessa_Database_Vendas_Loja.query(`SHOW TABLES FROM vendas_loja${id_da_loja}`, (err,result) => {
        for(i = 0; i < result.length; i++){
            console.log(result[i])
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