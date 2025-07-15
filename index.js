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
    password: "123456",
    database: "usuarios",
});

const db0 = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "123456",
});

const dbPixGerados = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "123456",
    database: "pixgerados",
});

app.use(express.json());
app.use(cors());

app.get("/teste", (req,res) => {
    res.send("teste")
})
 
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

app.post("/testeCadastro", (req, res) => {
    email_global = req.body.email;//esse email aqui é global, para poder criar o BD da loja na hora que o usuario faz o cadastro.
    const senha = req.body.senha;
    const email = req.body.email;
    const nivel = req.body.nivel;
    const cpf = req.body.cpf;

    console.log(`${email} | ${senha} | ${nivel} | ${cpf}`)

    db.query("SELECT * FROM status_planos", (error, result) => {
        if(error){
            console.log(`Erro ao consultar: ${error}`)
        }else{
            for(i = 0; i < result.length; i++){
                console.log(result[i])
            }
        }
    })
    
    /*db.query("SELECT * FROM contas_usuarios WHERE email=?", [email], (err,result) => {
        if(err){
            res.send(err);
        }
        else if(result.length == 0){
            bcrypt.hash(senha, saltRounds, (erro,hash) => {
                db.query("INSERT INTO contas_usuarios(senha,email,nivel,cpf) VALUES (?,?,?,?)", [hash,email,nivel,cpf], (err,response) => {
                    if(err){
                        res.send(err);
                    }else{//Modifiquei aqui, não tinha o else.   
                        res.send({msg: "Cadastrado com sucesso!"});
                        criaDatabaseDaLoja();//também já cria as tabelas necessárias.
                    }
                });
            })
        }else{
            res.send({msg: "Já existe uma conta cadastrada com este email!"});
        }       
    });//PARA VALIDAR SE JÁ TEM ALGUM EMAIL IGUAL CADASTRADO NO BD*/

})

app.post("/cadastro", (req,res) => {
    email_global = req.body.email;//esse email aqui é global, para poder criar o BD da loja na hora que o usuario faz o cadastro.
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
                db.query("INSERT INTO contas_usuarios(senha,email,nivel,cpf) VALUES (?,?,?,?)", [hash,email,nivel,cpf], (err,response) => {
                    if(err){
                        res.send(err);
                    }else{//Modifiquei aqui, não tinha o else.   
                        res.send({msg: "Cadastrado com sucesso!"});
                        criaDatabaseDaLoja();//também já cria as tabelas necessárias.
                    }
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
        password: "123456",
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
        password: "123456",
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
                    res.send([{ codigo_produto: result[0].codigo_produto, produto: result[0].produto, preco: result[0].valor_de_venda, estoque: result[0].estoque, valor_de_compra: result[0].valor_de_compra},])  
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
                        listaProdutos.push({ codigo_produto: result[r].codigo_produto, produto: result[r].produto, preco: result[r].valor_de_venda, estoque: result[r].estoque, valor_de_compra: result[0].valor_de_compra},)
                    }
                    res.send(listaProdutos)  
                    //console.log(listaProdutos)
                }else{
                    console.log("Nenhum resultado encontrado!")
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
                        listaProdutos.push({ codigo_produto: result[r].codigo_produto, produto: result[r].produto, preco: result[r].valor_de_venda, estoque: result[r].estoque, valor_de_compra: result[0].valor_de_compra},)
                    }    
                    res.send(listaProdutos)  
                    console.log(listaProdutos)
                }else{
                    console.log("Nenhum resultado encontrado!")
                    res.send({msg:"Nenhum resultado encontrado!"})
                }       
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
                    criaDatabase_Vendas_Da_Loja();//Cria a database que armazena as vendas da loja!   
                    //acessa o banco de dados da loja.
                    const loja1 = mysql.createPool({
                        host: "localhost",
                        user: "root",
                        password: "123456",
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
                                sobre_o_produto FLOAT NULL,
                                sobre_a_venda FLOAT NULL,
                                lucro FLOAT NULL,
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

            //INSERE O STATUS INICIAL DO PLANO DESBRAVADOR DA LOJA.
            //Faço ele ao final, porque não interfere em nada no uso inicial do app cliente.
            const dataFutura = calcularDataFutura(7)
            const dataFuturaTratada = (dataFutura.toISOString().split('T')[0])
            console.log(dataFuturaTratada)
            db.query(`INSERT INTO status_planos(id_da_loja,email,metodo_de_pagamento,status,descricao_do_plano,preco,data_de_inicio,data_de_vencimento) values(?,?,?,?,?,?,?,?)`,[result[0].id_da_loja,result[0].email,"indefinido","ativo","desbravador",0.00,`${dataSistema()}`,`${dataFuturaTratada}`], (error) => {
                if(error){
                    console.log(`Erro ao tentar inserir o status_plano: ` + error)
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

//TENHO QUE REESTRUTURAR ESSA PORCARIA DEPOIS, CRIAR FUNÇÕES SEPARADAS PARA O CÓDIGO FICAR MAIS LIMPO.
app.post("/finalizar-venda", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const listaDosProdutosVendidos = req.body.produtos_Vendidos;
    //PARTE EM TESTE------------
    contador = 0;
    const acessa_Database_Vendas_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `vendas_loja${id_da_loja}`,
    });

     
    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
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
                                                preco float not null,
                                                valor_de_compra float not null)Default charset=utf8;`, (erro) => {
                                                    if(erro){
                                                        console.log(`Erro ao tentar criar tabela da venda ERRO: ${erro}`)
                                                        res.send({msg:"Erro!"})
                                                    }else{
                                                        //Parte que insere os produtos da venda na tabela.
                                                        if(listaDosProdutosVendidos.length != 0){
                                                            for(produtos = 0; produtos < listaDosProdutosVendidos.length; produtos ++){
                                                                acessa_Database_Vendas_Loja.query(`INSERT INTO ${nomeDaTabela} (cod_produto,produto,unidades,preco,valor_de_compra) VALUES(${listaDosProdutosVendidos[produtos][0]},'${listaDosProdutosVendidos[produtos][1]}',${listaDosProdutosVendidos[produtos][2]},${listaDosProdutosVendidos[produtos][3]},'${listaDosProdutosVendidos[produtos][4]}')`, (erro) => {
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
        password: "123456",
        database: `vendas_loja${id_da_loja}`,
    });
    
    acessa_Database_Vendas_Loja.query(`SHOW TABLES FROM vendas_loja${id_da_loja}`, (error, result) => {
        if(error){
            console.log("Erro ao tentar: SHOW TABLES FROM vendas_loja" + error)
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
                                    listaDosProdutos.push({codigoProduto: result2[a].cod_produto, produto: result2[a].produto, unidades: result2[a].unidades, preco: result2[a].preco, valor_de_compra: result2[a].valor_de_compra})//ENVIANDO OS DADOS DA VENDA PARA A LISTA.                                             
                                }                                
                            }
                            //SE JÁ TIVER VERIFICADO TODAS AS VENDAS DO DIA, ENVIO AS INFORMAÇÕES PRO BANCO DE DADOS
                            //EU NÃO SEI NEM PORQUE ESSA PORCARIA FUNCIONA, ATÉ PORQUE OS CONTADORES ACABAM TENDO VALORES IGUAIS A CADA LOOP, MAS SÓ FUNCIONA DESSE JEITO, ACREDITO QUE ESTOU PERDENDO DESEMPENHO, PORQUE ACABA "ENVIANDO" A CADA NOVO LOOP, MAS NÃO DÁ AQUELE ERRO DE JÁ TER ENVIADO AS INFORMAÇÕES, ENTENDI NADA, MAS TÁ FUNCIONANDO KKK
                            if(contador1 == contador){
                                res.send(listaDosProdutos)                              
                            }
                                                              
                        })
                    }
                }  
                if(contador == 0){//caso não tenha nenhuma venda na data de hoje no contador, ele retorna que não há venda
                    res.send({msg:"Nenhuma venda realizada hoje!"})
                }             
            }else{
                console.log("Nenhuma venda encontrada!")
                res.send({msg:"Nenhuma venda encontrada!"})
            }     
        }

    })
})

//Essa função é a utilizada na tela faturamento e lucro
app.post("/busca-Vendas-Por-Data", (req, res) =>{
    const id_da_loja = req.body.id_da_loja;
    const dataEscolhida = req.body.dataEscolhida;

    if(dataEscolhida.length == 8){  
        const acessa_Database_Vendas_Loja = mysql.createPool({
            host: "localhost",
            user: "root",
            password: "123456",
            database: `vendas_loja${id_da_loja}`,
        });
        
        acessa_Database_Vendas_Loja.query(`SHOW TABLES FROM vendas_loja${id_da_loja}`, (error, result) => {
            if(error){
                console.log("Erro ao tentar: SHOW TABLES FROM vendas_loja" + error)
                console.log({msg:"Erro"})
            }else{
                var listaDosProdutos = []
                contador = 0
                contador1 = 0
                if(result.length > 0){  //SE TIVER ALGUMA VENDA NO BANCO DE DADOS DA LOJA
                    
                    //Conta quantas tabelas de vendas tem na loja.
                    for(i = 0; i < result.length; i++){
                        const resultado = result[i][`Tables_in_vendas_loja${id_da_loja}`];//RETORNA EX: VENDA107012025
                        
                        if(resultado.substr(-8) == dataEscolhida){ //SE TIVER VENDA COM A DATA DE HOJE    
                            contador++
                            acessa_Database_Vendas_Loja.query(`SELECT * FROM ${resultado}`, (err, result2) => {
                                if(err){
                                    console.log("Erro")
                                }else{              
                                    contador1 ++                 
                                    for(a = 0; a < result2.length; a ++){
                                        listaDosProdutos.push({codigoProduto: result2[a].cod_produto, produto: result2[a].produto, unidades: result2[a].unidades, preco: result2[a].preco, valor_de_compra: result2[a].valor_de_compra})//ENVIANDO OS DADOS DA VENDA PARA A LISTA.                                             
                                    }                                
                                }
                                //SE JÁ TIVER VERIFICADO TODAS AS VENDAS DO DIA, ENVIO AS INFORMAÇÕES PRO BANCO DE DADOS
                                //EU NÃO SEI NEM PORQUE ESSA PORCARIA FUNCIONA, ATÉ PORQUE OS CONTADORES ACABAM TENDO VALORES IGUAIS A CADA LOOP, MAS SÓ FUNCIONA DESSE JEITO, ACREDITO QUE ESTOU PERDENDO DESEMPENHO, PORQUE ACABA "ENVIANDO" A CADA NOVO LOOP, MAS NÃO DÁ AQUELE ERRO DE JÁ TER ENVIADO AS INFORMAÇÕES, ENTENDI NADA, MAS TÁ FUNCIONANDO KKK
                                if(contador1 == contador){
                                    res.send(listaDosProdutos)        
                                }
                                                                
                            })
                        }
                    }  
                    if(contador == 0){//caso não tenha nenhuma venda na data de hoje no contador, ele retorna que não há venda
                        res.send({msg:"Nenhuma venda encontrada na data escolhida!"})
                    }             
                }else{
                    console.log("Nenhuma venda encontrada!") 
                    res.send({msg:"Nenhuma venda encontrada na data escolhida!"})
                }     
            }  
        })
    }else if(dataEscolhida.length == 6){//Quando a busca foi feita apenas por mês e ano.
        const acessa_Database_Vendas_Loja = mysql.createPool({
            host: "localhost",
            user: "root",
            password: "123456",
            database: `vendas_loja${id_da_loja}`,
        }); 
        
        acessa_Database_Vendas_Loja.query(`SHOW TABLES FROM vendas_loja${id_da_loja}`, (error, result) => {
            if(error){
                console.log("Erro ao tentar: SHOW TABLES FROM vendas_loja" + error)
                console.log({msg:"Erro"})
            }else{
                var listaDosProdutos = []
                contador = 0
                contador1 = 0
                if(result.length > 0){  //SE TIVER ALGUMA VENDA NO BANCO DE DADOS DA LOJA
                    
                    //Conta quantas tabelas de vendas tem na loja.
                    for(i = 0; i < result.length; i++){
                        const resultado = result[i][`Tables_in_vendas_loja${id_da_loja}`];//RETORNA EX: VENDA107012025
                        
                        if(resultado.substr(-6) == dataEscolhida){ //SE TIVER VENDA COM A DATA DE HOJE    
                            contador++
                            acessa_Database_Vendas_Loja.query(`SELECT * FROM ${resultado}`, (err, result2) => {
                                if(err){
                                    console.log("Erro")
                                }else{              
                                    contador1 ++                 
                                    for(a = 0; a < result2.length; a ++){
                                        listaDosProdutos.push({codigoProduto: result2[a].cod_produto, produto: result2[a].produto, unidades: result2[a].unidades, preco: result2[a].preco, valor_de_compra: result2[a].valor_de_compra})//ENVIANDO OS DADOS DA VENDA PARA A LISTA.                                             
                                    }                                
                                }
                                //SE JÁ TIVER VERIFICADO TODAS AS VENDAS DO DIA, ENVIO AS INFORMAÇÕES PRO BANCO DE DADOS
                                //EU NÃO SEI NEM PORQUE ESSA PORCARIA FUNCIONA, ATÉ PORQUE OS CONTADORES ACABAM TENDO VALORES IGUAIS A CADA LOOP, MAS SÓ FUNCIONA DESSE JEITO, ACREDITO QUE ESTOU PERDENDO DESEMPENHO, PORQUE ACABA "ENVIANDO" A CADA NOVO LOOP, MAS NÃO DÁ AQUELE ERRO DE JÁ TER ENVIADO AS INFORMAÇÕES, ENTENDI NADA, MAS TÁ FUNCIONANDO KKK
                                if(contador1 == contador){
                                    res.send(listaDosProdutos)        
                                }
                                                                
                            })
                        }
                    }  
                    if(contador == 0){//caso não tenha nenhuma venda na data de hoje no contador, ele retorna que não há venda
                        res.send({msg:"Nenhuma venda encontrada na data escolhida!"})
                    }             
                }else{
                    console.log("Nenhuma venda encontrada!") 
                    res.send({msg:"Nenhuma venda encontrada na data escolhida!"})
                }     
            }  
        })
    }else if(dataEscolhida.length == 4){//Quando a busca é feita buscando apenas pelo ano 
        const acessa_Database_Vendas_Loja = mysql.createPool({
            host: "localhost",
            user: "root",
            password: "123456",
            database: `vendas_loja${id_da_loja}`,
        }); 
        
        acessa_Database_Vendas_Loja.query(`SHOW TABLES FROM vendas_loja${id_da_loja}`, (error, result) => {
            if(error){
                console.log("Erro ao tentar: SHOW TABLES FROM vendas_loja" + error)
                console.log({msg:"Erro"})
            }else{
                var listaDosProdutos = []
                contador = 0
                contador1 = 0
                if(result.length > 0){  //SE TIVER ALGUMA VENDA NO BANCO DE DADOS DA LOJA
                    
                    //Conta quantas tabelas de vendas tem na loja.
                    for(i = 0; i < result.length; i++){
                        const resultado = result[i][`Tables_in_vendas_loja${id_da_loja}`];//RETORNA EX: VENDA107012025
                        
                        if(resultado.substr(-4) == dataEscolhida){ //SE TIVER VENDA COM A DATA DE HOJE    
                            contador++
                            acessa_Database_Vendas_Loja.query(`SELECT * FROM ${resultado}`, (err, result2) => {
                                if(err){
                                    console.log("Erro")
                                }else{              
                                    contador1 ++                 
                                    for(a = 0; a < result2.length; a ++){
                                        listaDosProdutos.push({codigoProduto: result2[a].cod_produto, produto: result2[a].produto, unidades: result2[a].unidades, preco: result2[a].preco, valor_de_compra: result2[a].valor_de_compra})//ENVIANDO OS DADOS DA VENDA PARA A LISTA.                                             
                                    }                                
                                }
                                //SE JÁ TIVER VERIFICADO TODAS AS VENDAS DO DIA, ENVIO AS INFORMAÇÕES PRO BANCO DE DADOS
                                //EU NÃO SEI NEM PORQUE ESSA PORCARIA FUNCIONA, ATÉ PORQUE OS CONTADORES ACABAM TENDO VALORES IGUAIS A CADA LOOP, MAS SÓ FUNCIONA DESSE JEITO, ACREDITO QUE ESTOU PERDENDO DESEMPENHO, PORQUE ACABA "ENVIANDO" A CADA NOVO LOOP, MAS NÃO DÁ AQUELE ERRO DE JÁ TER ENVIADO AS INFORMAÇÕES, ENTENDI NADA, MAS TÁ FUNCIONANDO KKK
                                if(contador1 == contador){
                                    res.send(listaDosProdutos)        
                                }
                                                                
                            })
                        }
                    }  
                    if(contador == 0){//caso não tenha nenhuma venda na data de hoje no contador, ele retorna que não há venda
                        res.send({msg:"Nenhuma venda encontrada na data escolhida!"})
                    }             
                }else{
                    console.log("Nenhuma venda encontrada!") 
                    res.send({msg:"Nenhuma venda encontrada na data escolhida!"})
                }     
            }  
        })
    }
})

app.post("/adicionar-estoque", (req, res) =>{
    const id_da_loja = req.body.id_da_loja;
    const codigoProduto = req.body.codigoProduto;
    const novoEstoque = req.body.novoEstoque;

    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    })

    acessa_Database_Da_Loja.query(`UPDATE produtos SET estoque=${novoEstoque} WHERE codigo_produto=${codigoProduto}`, (error) => {
        if(error){
            res.send("Erro!")
            console.log(`Erro ao tentar alterar o estoque. Erro: ${error}`)
        }else{
            res.send("Sucesso!")
        }
    })
    
})

app.post("/remover-estoque", (req, res) =>{
    const id_da_loja = req.body.id_da_loja;
    const codigoProduto = req.body.codigoProduto;
    const novoEstoque = req.body.novoEstoque;

    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    })

    acessa_Database_Da_Loja.query(`UPDATE produtos SET estoque=${novoEstoque} WHERE codigo_produto=${codigoProduto}`, (error) => {
        if(error){
            res.send("Erro!")
            console.log(`Erro ao tentar alterar o estoque. Erro: ${error}`)
        }else{
            res.send("Sucesso!")
        }
    })
    
})

app.post("/alterar-valor-compra-e-venda", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const codigoProduto = req.body.codigo_produto;
    const novoValorDeCompra = req.body.novoValorDeCompra;
    const novoValorDeVenda = req.body.novoValorDeVenda;

    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    })

    acessa_Database_Da_Loja.query(`UPDATE produtos SET valor_de_compra=${novoValorDeCompra}, valor_de_venda=${novoValorDeVenda} WHERE codigo_produto=${codigoProduto}`, (error) =>{
        if(error){
            res.send("Erro!")
            console.log(`Erro ao tentar alterar valor de compra e venda. Erro: ${error}`)
        }else{
            res.send("Sucesso!")
        }
    })
})

app.post("/busca-produtos", (req, res) =>{
    const id_da_loja = req.body.id_da_loja;
    listaDosProdutos = []

    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    })

    acessa_Database_Da_Loja.query(`SELECT * FROM produtos`, (error, result) => {
        if(error){
            res.send("Erro!")
            console.log(`Erro ao tentar alterar o estoque. Erro: ${error}`)
        }else{
            for(i = 0; i < result.length; i++){
                listaDosProdutos.push(result[i])
            }
        }
        res.send(listaDosProdutos)
    })
    
})

//PARTE DA COMANDA
app.post("/cria-nova-comanda", (req, res) => {
    const id_da_loja = req.body.id_da_loja;
    const novaComanda = req.body.novaComanda;

    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    })

    acessa_Database_Da_Loja.query(`CREATE TABLE IF NOT EXISTS mesa_${novaComanda}(
        cod_produto INT NOT NULL,
        produto VARCHAR(100) NOT NULL,
        unidades INT NOT NULL,
        preco float NOT NULL
        )ENGINE=INNODB default charset = utf8;`,(err) => {
        if(err){
            console.log("Não foi possível criar a tabela de produtos!")
        }else{
            res.send("Sucesso!")
        }
    })
})

app.post("/excluir-comanda", (req, res) => {
    const id_da_loja = req.body.id_da_loja;
    const comanda = req.body.comanda;

    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    })

    acessa_Database_Da_Loja.query(`DROP TABLE ${comanda}`, (error) => {
        if(error){
            res.send(error)
        }else{
            res.send("Sucesso!")
        }
    })
})

app.post("/buscar-comandas-abertas", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const novaComanda = req.body.novaComanda;

    const loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    });

    loja.query(`SHOW TABLES`, (error, result) => {
        if(error){
            console.log(error)
        }else{
            if(result.length > 0){
                let lista_De_Comandas = ["ESCOLHA UMA COMANDA"]
                for(let i = 0; i< result.length; i++){
                    //console.log(result[i].Tables_in_loja139)
                    const nome_tabela = result[i][`Tables_in_loja${id_da_loja}`]
                    //console.log(`RESULT TESTE: ${result[i][`Tables_in_loja${id_da_loja}`]}`)
                    if(nome_tabela.substr(0,4) == 'mesa'){//Pego só as tabelas que começam com mesa
                        lista_De_Comandas.push(nome_tabela)
                    }
                }
                res.send(lista_De_Comandas)
            }else{
                console.log("Não tem nenhuma comanda aberta.")
            }

        }
    })

})

app.post("/insere-itens-da-comanda", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const comanda = req.body.comanda;
    const lista_da_comanda = req.body.lista_da_comanda;
    const loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    });

    //Primeiro excluo os itens que já estão na tabela, para depois inserir os novos itens da comanda.
    loja.query(`DELETE FROM ${comanda}`, (error) => {
        if(error){
            console.log(`Erro ao excluir itens da comanda: ${error}`)
        }else{//pego cada um dos itens da comanda, e insiro na tabela da comanda.
            for(let i = 0; i < lista_da_comanda.length; i++){//Separo cada parte do item na array.
                cod_Produto = lista_da_comanda[i][0]
                produto = lista_da_comanda[i][1]
                unidades = lista_da_comanda[i][2]
                preco = lista_da_comanda[i][3]
            
                loja.query(`INSERT INTO ${comanda}(cod_produto,produto,unidades,preco) VALUES(${cod_Produto},'${produto}',${unidades},${preco})`, (error) => {
                    if(error){
                        console.log(`Erro no insere-itens-da-comanda: ${error}`)
                    }
                })
            }
            console.log(`inseri os itens na comanda.`)
            res.send(`Produtos salvos na comanda:${comanda}`) 
        }
    })


    //console.log(`lista da comanda: ${comanda}`)
 
    //loja.query(`INSERT INTO ${comanda}(cod_produto,produto,unidades,preco) VALUES(cod_produto,produto,unidades,preco)`)
})

app.post("/buscar-itens-comanda", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const comanda = req.body.comanda;
    console.log(`buscou itens da comanda.`)
    const loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `loja${id_da_loja}`,
    });

    let itensNaComanda = []

    loja.query(`SELECT * FROM ${comanda}`,(error, result) => {
        if(error){
            console.log(error)
        }else{
            if(result.length > 0){//Caso tenha itens na comanda selecionada.
                for(let i = 0; i< result.length; i++){
                    cod_Produto = result[i].cod_produto
                    produto = result[i].produto
                    unidades = result[i].unidades
                    preco = result[i].preco

                    itensNaComanda.push([cod_Produto,produto,unidades,preco])
                }

                res.send(itensNaComanda)
            }else{
                res.send("Nenhum resultado")
            }
            //console.log(result)
        }
    })
})

//FIM PARTE DA COMANDA

//Se eu mudar o valor aqui, automaticamente já é repassado para os clientes no front.
app.get('/planos', (req,res) => {//Preço dos planos 156,15/ 290
    const planos = [["Plano Mensal", 0.10],["Plano Semestral", 156.15],["Plano Anual", 290.00]]
    res.send(planos)
})

app.get('/planos-assinatura', (req,res) => {//Links para assinar o plano
    const planos = [
        ["Plano Mensal", "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=2c938084948dcc0101948ff4c3370137"],["Plano Semestral", "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=2c938084948dcc01019494ed71b00387"],
        ["Plano Anual", "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=2c938084948dcc01019494f10471038a"]]
    res.send(planos)
})

app.get('/mensagens-para-clientes', (req,res) => {
    const mensagens_gerais = ["Feliz ano novo!"]
    const mensalidades = [
        ["Seu plano está próximo do vencimento!"]
        ["Seu plano venceu! para renovar, clique no botão abaixo!"]
    ]
})

app.get('/codigo-desconto', (req, res) => {
    const codigoDesconto = ['GANHE20','GANHE100']
})

//Pega só a função em atraso.
//A data nessa funão tá corrigida para vencer um dia após a data de vencimento.
//Analisar e corrigir na outra função também.
//Caso corrija na outra funão, lembrar de fazer todos os testes no APP CLIENT
function resultadoDaMensalidade(dueDate){
    const today = new Date();
    const due = new Date(dueDate)

    //Calcula a diferença em milissegundos
    const timeDifference = due - today;

    //Converte a diferença para dias
    // o 1000 é de 1000milissegundos em um segundo
    // o 3600 é de segundos em uma hora e o 24 é o número de horas em um dia
    const daysDifference = timeDifference / (1000*3600*24);

    if(daysDifference < -1){
        //Plano já venceu e está em atraso.
        return false;
    }else{
        //AINDA NÃO CHEGOU A DATA.
        return true;
    }
}

app.post('/verifica-pagamento-pix', (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    var listaDePlanosPix = []
    let contaPix = 0;  
    let pagamentosAprovados = 0;
    //USO O 'STATUS="PENDING"'  PARA VERIFICAR APENAS OS PIX QUE AINDA NÃO FORAM PAGOS.
    dbPixGerados.query(`SELECT * FROM loja${id_da_loja} WHERE status='pending'`, (error, result) => {
        if(error){
            console.log("Erro ao tentar selecionar * da function verifica-pagamento-pix: " + error)
            res.send("Error!")
        }else{
            if(result.length != 0){
                for(c = 0; c < result.length; c++){
                    //Verifico os pix que ainda estão na data válida.
                    if(resultadoDaMensalidade(result[c].date_of_expiration)){//PIX AINDA NÃO VENCEU, VERIFICO O PAGAMENTO DELE.
                        //capturaPagamento(result[c].id_do_pix, id_da_loja, result.length, result[c].description)//Verifico se o pix foi pago
                        const id_do_pix = result[c].id_do_pix;
                        const description = result[c].description;
                        payment.capture({//Capturo o pagamento no mercadoPago
                            id: id_do_pix,
                        }).then((response) => {     
                            if(response.status == 'approved'){
                                const date_approved_tratado = (response.date_approved.split('T')[0])           
                                dbPixGerados.query(`UPDATE loja${id_da_loja} SET status='pago', date_approved='${date_approved_tratado}' WHERE id_do_pix=${id_do_pix}`, (error) => {
                                    if(error){
                                        console.log(error)
                                    }else{
                                        contaPix++ //Esse contador é para contar cada pix no banco de dados.
                                        listaDePlanosPix.push(description)
                                        console.log(`Pagamento aprovado para o pix com o id: ${id_do_pix}`)
                                        pagamentosAprovados ++
                                        if(contaPix == result.length){//Quando o contadorDePix for igual ao número de resultados pix no banco de dados, ai sim posso continuar a função
                                            //Se o contador de pix verificados for igual a quantidade de pix encontrados na outra função
                                            console.log(`conta: ${contaPix} resultados: ${result.length}`)
                                            if(pagamentosAprovados > 0){
                                                console.log(`Teve pagamentos aprovados`)
                                                res.send(`Teve pagamentos aprovados`)
                                                if(listaDePlanosPix.length != 0){ //Somo mensalidades dos pix pagos.
                                                    somaMensalidadesPlanos(listaDePlanosPix, id_da_loja)
                                                    //listaDePlanosPix.length = 0;//limpo a listaDePlanos
                                                    //contaPix = 0;//limpo o conta pix
                                                }
                                            }else{
                                                console.log(`Não teve pagamentos aprovados!`)
                                                res.send(`Não teve pagamentos aprovados!`)
                                            }
                                            
                                        }
                                    }
                                })
                            }
                    
                        }).catch((error) => {
                            if(error.status == 400){//PIX PAGOS OU NÃO APROVADOS NÃO CONTAM.
                                contaPix++//Esse contador é para contar cada pix no banco de dados.
                                console.log(`Pagamento NÃO aprovado para o pix com o id: ${id_do_pix}`)
                                if(contaPix == result.length){//Quando o contadorDePix for igual ao número de resultados pix no banco de dados, ai sim posso continuar a função
                                    //Se o contador de pix verificados for igual a quantidade de pix encontrados na outra função
                                    console.log(`conta: ${contaPix} resultados: ${result.length}`)
                                    if(pagamentosAprovados > 0){
                                        console.log(`Teve pagamentos aprovados`)
                                        res.send(`Teve pagamentos aprovados`)
                                    }else{
                                        console.log(`Não teve pagamentos aprovados!`)
                                        res.send(`Não teve pagamentos aprovados!`)
                                    }
                                }
                            }else{
                                console.log(error)
                            }
                        })   
                    }else{
                        contaPix++
                        if(contaPix == result.length){
                            console.log(`Nenhum pix ativo!`)
                            res.send('Nenhum pix ativo!')
                        }                       
                    }
                    //Se o pix já tiver vencido eu nem verifico.
                }
            }else{
                console.log(`Não tem nenhúm pix gerado pela loja:${id_da_loja}`)
                res.send("Nenhum pix gerado pela loja.")
            }                   
        }
    })
})

async function verificaPagamentoPix(id_da_loja) {
    dbPixGerados.query(`SELECT * FROM loja${id_da_loja}`, (error, result) => {
        if(error){
            console.log("Erro ao tentar selecionar * da function verifica-pagamento-pix: " + error)
            res.send("Error!")
        }else{
            if(result.length != 0){
                for(c = 0; c < result.length; c++){
                    //Verifico os pix que ainda estão na data válida.
                    if(resultadoDaMensalidade(result[c].date_of_expiration)){//PIX AINDA NÃO VENCEU, VERIFICO O PAGAMENTO DELE.
                        //o primeiro campo da func a baixo é o id do pix, o segundo o id da loja, e o terceiro é a quantidade de resultados de pix encontrados na loja, o quarto é a descricão do pix.
                        capturaPagamento(result[c].id_do_pix, id_da_loja, result.length, result[c].description)//Verifico se o pix foi pago
                    }
                    //Se o pix já tiver vencido eu nem verifico.
                }
            }else{
                console.log(`Não tem nenhúm pix gerado pela loja:${id_da_loja}`)
            }                   
        }
    })
}

//Se o pagamento ainda não tiver sido feito, retorna o status 400 com a message: 'The action requested is not valid for the current payment state'
//se tiver sido feito, ele retorna todo o json.
//Caso aprovado: status: 'approved',
var listaDePlanosPix = []  //Precisei colocar essas bostas fora da function, analisar depois se consigo modificar.
let contaPix = 0;          //Precisei colocar essas bostas fora da function, analisar depois se consigo modificar.
async function capturaPagamento(id, id_da_loja,contadorResultados,description){
    payment.capture({
        id:  id,
    }).then((response) => {     
        if(response.status == 'approved'){
            const date_approved_tratado = (response.date_approved.split('T')[0])           
            dbPixGerados.query(`UPDATE loja${id_da_loja} SET status='pago', date_approved='${date_approved_tratado}' WHERE id_do_pix=${id}`, (error) => {
                if(error){
                    console.log(error)
                }else{
                    contaPix++ //Esse contador é para contar cada pix no banco de dados.
                    listaDePlanosPix.push(description)
                    console.log(`Pagamento aprovado para o pix com o id: ${id}`)
                    if(contaPix == contadorResultados){//Quando o contadorDePix for igual ao número de resultados pix no banco de dados, ai sim posso continuar a função
                        //Se o contador de pix verificados for igual a quantidade de pix encontrados na outra função
                        console.log(`conta: ${contaPix} resultados: ${contadorResultados}`)
                        if(listaDePlanosPix.length != 0){
                            somaMensalidadesPlanos(listaDePlanosPix, id_da_loja)
                            listaDePlanosPix.length = 0;//limpo a listaDePlanos
                            contaPix = 0;//limpo o conta pix
                        }
                    }
                }
            })
        }

    }).catch((error) => {
        if(error.status == 400){
            contaPix++//Esse contador é para contar cada pix no banco de dados.
            console.log(`Pagamento NÃO aprovado para o pix com o id: ${id}`)
        }else{
            console.log(error)
        }
    })    
}

//Função para somar as mensalidades, dos planos pagos pelo cliente via pix.
async function somaMensalidadesPlanos(lista, id_da_loja){
    let somaTempoDosPlanos = 0;
    for(c = 0; c < lista.length; c++){
        if(lista[c] == "pagamento-plano-mensal"){
            somaTempoDosPlanos += 30
        }else if(lista[c] == "pagamento-plano-semestral"){
            somaTempoDosPlanos += 180
        }else if(lista[c] == "pagamento-plano-anual"){
            somaTempoDosPlanos += 365
        }

        if(c+1 == lista.length){//Se o for já tiver sido finalizado, ai sim insiro a nova data de vencimento na tabela.
            console.log(`Soma das mensalidades encontradas: ${somaTempoDosPlanos}`)
            insereNovaDataDeVencimento(somaTempoDosPlanos,id_da_loja)
        }
    }
}

async function insereNovaDataDeVencimento(novaData,id_da_loja){//Insere a nova data de vencimento do plano do cliente.
    /* O novaData é quantos dias vai ser somada a data! 
       *Porque se o cliente tiver com um plano ativo, a data da mensalidade vai ser
       somada ao plano ativo dele, caso seja um plano inativo, a data da mensalidade
       vai ser somada a data de aprovaçao do plano escolhido.
    */ 

    db.query(`SELECT data_de_vencimento FROM status_planos WHERE id_da_loja=${id_da_loja}`, (erro,result) =>{
        if(erro){
            console.log(`Erro na função somaDataMensalidade: ${erro}`)
        }else{
            if(resultadoDaMensalidade(result[0].data_de_vencimento)){//Se venceu é false, senão, verdadeira
                const date1 = new Date(result[0].data_de_vencimento);
                date1.setDate(date1.getDate() + novaData)
                const dataFuturaTratada = (date1.toISOString().split('T')[0])

                db.query(`UPDATE status_planos SET metodo_de_pagamento='pix', status='ativo', descricao_do_plano='${novaData} dias', data_de_vencimento='${dataFuturaTratada}' WHERE id_da_loja=${id_da_loja}`, (error) => {
                    if(error){
                        console.log(`Erro na função 'insereNovaDataDeVencimento()' erro: ${error}`)
                    }else{
                        console.log('Nova data alterada com sucesso!')
                    }
                })
            }else{
                const date2 = new Date();
                date2.setDate(date2.getDate() + novaData)
                const dataFuturaTratada = (date2.toISOString().split('T')[0])
                db.query(`UPDATE status_planos SET metodo_de_pagamento='pix', status='ativo', data_de_vencimento='${dataFuturaTratada}' WHERE id_da_loja=${id_da_loja}`, (error) => {
                    if(error){
                        console.log(`Erro na função 'insereNovaDataDeVencimento()' erro: ${error}`)
                    }else{
                        console.log('Nova data alterada com sucesso!')
                    }
                })
            }
        }
    })

}

//Busco as informacoes do cliente para gerar o pix:
app.post("/busca-dados-para-gerar-pix", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const acessa_Database_Da_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `usuarios`,
    })

    acessa_Database_Da_Loja.query(`SELECT * FROM contas_usuarios WHERE id_da_loja=${id_da_loja}`, (error, response) => {
        if(error){
            console.log(error)
            res.send("Erro!")
        }else{
            const dados = [response[0].email, response[0].cpf]
            res.send(dados)
        }
    })
})

app.post("/busca_data_de_vencimento_mensalidade", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    db.query(`SELECT * FROM status_planos WHERE id_da_loja=${id_da_loja}`, (error, result) => {
        if(error){
            console.log("Erro no post 'busca_data_de_vencimento_mensalidade:'" + error)
        }else{
            res.send(result[0].data_de_vencimento)
        }
    })
})

//Função para o desbloqueio de confiança.
app.post("/desbloqueio-de-confianca", (req,res) =>{
    const id_da_loja = req.body.id_da_loja;
    const dataFutura = calcularDataFutura(7)
    const dataFuturaTratada = (dataFutura.toISOString().split('T')[0])//utilizar sempre essa no sistema.
    db.query(`SELECT status FROM status_planos WHERE id_da_loja=${id_da_loja}`, (erro,result) =>{
        if(erro){
            console.log("Erro ao verificar status da loja para desbloqueio-de-confiança: " + erro)
            res.send("Error!")
        }else{
            if(result[0].status != "pendente"){
                db.query(`UPDATE status_planos SET status='pendente', data_de_vencimento='${dataFuturaTratada}' where id_da_loja=${id_da_loja};`, (error) => {
                    if(error){
                        console.log(`Erro ao tentar inserir o status_plano: ` + error)
                        res.send("Error!")
                    }else{
                        res.send("desbloqueado")//Desbloqueio de confiança permitido!
                    }
                })
            }else{
                res.send("pendente")//Desbloqueio de confiança negado pois já foi utilizado!
            }
        }
    })
})

function dataSistema(){
    const date = new Date();
    //A data precisou ser tratada pois quando a data é exemplo: 07/01, ele não pega o 0, agora sim está correta! Não mude!
    data = ('0'+date.getDate()).slice(-2) + ('0'+(date.getMonth()+1)).slice(-2) + (date.getFullYear())
    //var data = (`${date.getDate()}${date.getMonth()+1}${date.getFullYear()}`)
    return data
}
//Em algumas partes do sistema preciso inserir uma data somada ao sistema.
function calcularDataFutura(dias){
    const date = new Date();
    //A data precisou ser tratada pois quando a data é exemplo: 07/01, ele não pega o 0, agora sim está correta! Não mude!
    //Adiciona dias:
    date.setDate(date.getDate() + dias)

    return date;
    /*Exemplo de uso:
    const adicionar7Dias = 7;
    const dataFutura = calcularDataFutura(adicionar7Dias)
    console.log(dataFutura.toISOString().split('T')[0]) Formata a data para YYYY-MM-DD
    */
}

//No sistema, quando o usuario paga o pix, a data do pagamento deve somar a data da mensalidade ativa dele.
//exemplo: a mensalidade dele vence mês 06, e ele pagou um plano de 6 meses, a soma deve ser feita apartir do mês 06.
function somaDataMensalidade(dias, id_da_loja){
    /* O dias é quantos dias vai ser somada a data que foi recebida! 
       Porque se o cliente tiver com um plano ativo, a data da mensalidade vai ser
       somada ao plano ativo dele, caso seja um plano inativo, a data da mensalidade
       vai ser somada a data de aprovaçao do plano escolhido.
    */
    
    const date = new Date();
    date.setDate(date.getDate() + dias)

    db.query(`SELECT data_de_vencimento FROM status_planos WHERE id_da_loja=${id_da_loja}`, (erro,result) =>{
        if(erro){
            console.log(`Erro na funcao somaDataMensalidade: ${erro}`)
        }else{
            if(resultadoDaMensalidade(result[0].data_de_vencimento)){//Se venceu é false, senão, verdadeira
                const date1 = new Date(result[0].data_de_vencimento);
                date.setDate(date1.getDate() + dias)
                return date1;
            }else{
                return date;
            }
        }
    })
}

function criaNomeDaTabelaVendaPorData(){
    contador = 1;
    const acessa_Database_Vendas_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
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
                sobre_o_produto FLOAT NULL,
                sobre_a_venda FLOAT NULL,
                lucro FLOAT NULL,
                local_armazenamento VARCHAR(50) NULL,
                PRIMARY KEY(codigo_produto)
            )ENGINE=INNODB default charset = utf8;`,(err) => {
                if(err){
                    console.log("Não foi possível criar a tabela de produtos!")
                }
            })
}

function criaTablePixGerados(id_da_loja,id,status,description,transaction_amount, date_created,date_of_expiration){
    const acessa_Database_PixGerados_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `pixgerados`,
    });
    //Ia fazer um verificador para ver se a loja já estava cadastrada, e se tivesse inserir, mas assim já funciona.
    //Cria a tabela que vai ficar os dados da venda.
    acessa_Database_PixGerados_Loja.query(`CREATE TABLE IF NOT EXISTS loja${id_da_loja}(
        id_do_pix BIGINT NOT NULL,
        status VARCHAR(20) NOT NULL,
        description VARCHAR(30) NOT NULL,
        transaction_amount FLOAT NOT NULL,
        date_created CHAR(10) NOT NULL,
        date_of_expiration CHAR(10) NOT NULL,
        date_approved CHAR(10),
        PRIMARY KEY(id_do_pix)
    )ENGINE=INNODB default charset = utf8;`,(erro) => {
        if(erro){
            console.log("Não foi possível criar a tabela de pix!")
            console.log(erro)
        }else{
            console.log("Table pix criada com sucesso!")
            insere_ID_Do_Pix_Na_Tabela_Da_Loja(id_da_loja,id,status,description,transaction_amount,date_created,date_of_expiration);
        }
    })
}

function insere_ID_Do_Pix_Na_Tabela_Da_Loja(id_da_loja,id,status,description,transaction_amount,date_created,date_of_expiration){
    const acessa_Database_PixGerados_Loja = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "123456",
        database: `pixgerados`,
    });

    let trata_date_created = date_created.slice(0, 10);
    let trata_date_expiration = date_of_expiration.slice(0,10);

    /*Na query abaixo, troquei o date_created por: trata_date_created, e troquei o date_of_expiration por: trata_date_expiration */

    acessa_Database_PixGerados_Loja.query(`INSERT INTO loja${id_da_loja}(id_do_pix,status,description,transaction_amount,date_created, date_of_expiration) VALUES(${id},"${status}","${description}",${transaction_amount}, "${trata_date_created}", "${trata_date_expiration}")`,(error, result) => {
        if(error){
            console.log(error)
        }else{
            console.log(result)
        }
    })
}

//OPÕES DE PAGAMENTOS ABAIXO:
//Step 1: Import the parts of the module you want to use
const {mercadoPagoConfig, Payment, default: MercadoPagoConfig} = require('mercadopago')
//Step 2: Initialize the client object
const client = new MercadoPagoConfig({
    accessToken: 'APP_USR-300753015905114-011610-3682639e5deb58a5f4e2863582fc717f-534170914',
    options: {timeout: 5000, idempotencyKey: 'abc'}
})
//Step 3: Initialize the API object
const payment = new Payment(client)

//Vou usar:
const {v4: uuidv4} = require('uuid')

app.post('/cria-pix', (req,res) => {
    console.log("REQUEST")
    console.log(req.body)

    const body ={
        transaction_amount: req.body.transaction_amount,
        description: req.body.description,
        payment_method_id: req.body.paymentMethodId,
        payer:{
            email: req.body.payer.email,
            identification: {
                type: req.body.payer.identification.identificationType,
                number: req.body.payer.identification.number,
            }
        },
    }
    //Step 5: Create request options object- Optional
    const requestOptions = { idempotencyKey: uuidv4() };

    //Step 6: Make the request
    //payment.create({ body, requestOptions }).then(console.log).catch(console.log);
    payment.create({ body, requestOptions })
    .then(response => {
        console.log('Resultado da transação:', response);
        res.send(response)//Envio a resposta pro client para pegar o link do pix.
        criaTablePixGerados(req.body.id_da_loja, response.id, response.status, response.description, response.transaction_amount, response.date_created, response.date_of_expiration)//Crio a tabela de pixGerados da loja caso ela não tenha e dentro de pixgerados insiro as informações que eu quero da "resposta do pix"
        //Também nem tratei a data para enviar só os 10primeiros digitos. ele mesmo tratou, se futuramente der algum b.o já sei onde procurar.
    })
    .catch(error => {
        console.error('Erro ao criar pagamento:', error);
    });
    
})

//FIM OPÇÕES DE PAGAMENTOS.


app.listen(port, () => {
    console.log(`Servidor iniciado na porta: ${port}`)
});