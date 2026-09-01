const express = require("express");
const app = express();
const port = 3000;
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

var email_global = '';
var id_Da_Loja_Global ='';

// CHAVE MESTRE DO SERVIDOR AQUI (Pode inventar qualquer frase)
const CHAVE_SECRETA = "GivlasiEstaEntrandoEmOutroPatamar!#&40028922";

//LOGO APÓS LANÇAR A NOVA VERSÃO, IREI INICIAR A REESTRUTURAÇÃO DE TODO O SERVIDOR, ORGANIZADO!!!

/*PARTE DO SOCKET.IO*/
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
//CONFIGURAÇÃO DO SOCKET.IO (Fica isolada do Express)
const io = new Server(server, {
    cors: { origin: "*" }
});

/* ESSA PARTE DO IO ESTÁ VULNERÁVEL! DEPOIS ATUALIZAR PARA TOKEN
    // Exemplo de barreira de segurança no Socket.io
    io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (validarTokenJWT(token)) {
        next(); // Permite a conexão
    } else {
        next(new Error("Não autorizado")); // Bloqueia a conexão na hora
    }
    });
*/

//NOVA VERSÃO:
/*  ATUALIZADA PARA REGISTRAR OS DADOS DOS DISPOSITIVOS 
                    & 
    CRIAR EVENTOS DE COMUNICAÇÃO DIRETA 
*/
// Objeto na memória do servidor para saber quem é quem por loja
const caixasAtivos = {}; 

io.on("connection", (socket) => {
    console.log("Cliente conectado:", socket.id); 
    // Agora recebemos um objeto com mais detalhes
    socket.on("entrar_na_loja", (dados) => { 
        //console.log("==> DADOS RECEBIDOS DO FRONTEND:", dados);
        const { id_loja, id_usuario, tipo } = dados; // tipo: 'desktop' ou 'mobile'
        const id_usuarioMinusculo = String(id_usuario?.toLowerCase());

        // 1. Entra na sala global da loja (para estoque, faturamento, etc.)
        socket.join(`loja_${id_loja}`);

        // 2. NOVA SALA PRIVADA: Entra na sala exclusiva do usuário nesta loja
        socket.join(`loja_${id_loja}_usuario_${id_usuarioMinusculo}`);

        socket.id_loja = id_loja;
        socket.id_usuario = id_usuarioMinusculo;
        socket.tipo = tipo;

        // Se for um computador, registramos que este caixa está online
        if (tipo === 'desktop') {
            if (!caixasAtivos[id_loja]) caixasAtivos[id_loja] = {};
            caixasAtivos[id_loja][id_usuarioMinusculo] = socket.id;
            console.log(`Desktop do usuario ${id_usuarioMinusculo} pronto na loja ${id_loja}`);
        }
    });

    // NOVO GATILHO: Disparado ao finalizar uma venda (por celular ou computador)
    socket.on("venda_finalizada_sucesso", (dados) => {
        const { id_loja, id_usuario, numero_comanda, dados_painel_global } = dados;
        const usuarioMinusculo = String(id_usuario?.toLowerCase());

        console.log(`> Venda finalizada: Loja ${id_loja} | Caixa: ${usuarioMinusculo} | Comanda: ${numero_comanda}`);

        // CANAL 1: PRIVADO - Envia o comando de fechar a tela APENAS para quem está na sala do usuário
        // Usamos socket.to() para enviar para o "par", evitando que o próprio emissor receba de volta se ele já limpou a tela localmente
        socket.to(`loja_${id_loja}_usuario_${usuarioMinusculo}`).emit("comando_limpar_tela_venda", {
            numero_comanda: numero_comanda
        });

        // CANAL 2: GLOBAL - Notifica a loja INTEIRA para atualizar estoques e faturamentos em tempo real
        /*
        io.to(`loja_${id_loja}`).emit("painel_loja_atualizar_dados", {
            tipo: "ATUALIZACAO_FLUXO",
            dados: dados_painel_global // Ex: { total_venda: 150.00, produtos_abaixados: [...] }
        });*/
    });

    // 1º GATILHO: Mobile pede os dados da venda rápida
    socket.on("solicitar_itens_venda", (dados) => {
        console.log("CELULAR SOLICITOU")
        const { id_loja, id_usuario } = dados;
        // Procura se o computador desse usuário está online
        //const socketIdDesktop = caixasAtivos[id_loja]?.[id_usuario];

        // Converte o id_usuario para minúsculo antes de procurar
        const usuarioMinusculo = String(id_usuario?.toLowerCase());
        const socketIdDesktop = caixasAtivos[id_loja]?.[usuarioMinusculo];
        console.log(`idLoja: ${id_loja} | idUsuario: ${usuarioMinusculo} |socketIdDesktop: ${socketIdDesktop} | caixasAtivos: ${JSON.stringify(caixasAtivos, null, 2)}`)
        
        if (socketIdDesktop) {
            // Envia o pedido DIRETAMENTE para o socket do Desktop correspondente
            io.to(socketIdDesktop).emit("desktop_enviar_itens", { socket_mobile_id: socket.id });
        } else {
            // Se o PC não for encontrado, avisa o celular na hora
            console.log("chegou aqui, Computador não foi encontrado!")
            socket.emit("venda_dados_resposta", { status: "OFFLINE", itens: [] });
        }
    });

    // 2º GATILHO: Desktop responde com os itens e o servidor repassa ao celular
    socket.on("desktop_respondeu_itens", (dados) => {
        const { socket_mobile_id, status, itens } = dados;
        
        // Repassa a lista de itens puramente para o socket do celular que pediu
        io.to(socket_mobile_id).emit("venda_dados_resposta", { status, itens });
    });

    // 3º GATILHO: Desktop avisa que a JTable mudou em tempo real
    socket.on("desktop_atualizou_venda", (dados) => {
        const { id_loja, id_usuario, itens } = dados;
        const usuarioMinusculo = String(id_usuario?.toLowerCase());
        
        console.log(`> Caixa ${usuarioMinusculo} da Loja ${id_loja} alterou o carrinho. Transmitindo...`);

        // Transmite para todos os celulares conectados na sala desta loja
        // O celular que estiver aberto na venda desse usuário vai capturar o JSON
        socket.to(`loja_${id_loja}`).emit("venda_atualizada_pelo_desktop", {
            status: "SUCESSO",
            id_usuario: usuarioMinusculo, // Enviamos para o celular checar se o ID bate com a sessão dele
            itens: itens
        });
    });

    // 4º GATILHO: Mobile avisa que alterou os itens e o servidor repassa ao Desktop
    socket.on("mobile_atualizou_venda", (dados) => {
        const { id_loja, id_usuario, itens } = dados;
        const usuarioMinusculo = String(id_usuario?.toLowerCase());

        // Localiza o ID do socket do Desktop associado a esse usuário
        const socketIdDesktop = caixasAtivos[id_loja]?.[usuarioMinusculo];

        console.log(`> Celular de ${usuarioMinusculo} atualizou a venda. Repassando ao Desktop...`);

        if (socketIdDesktop) {
            // Envia os novos itens direto para o computador correspondente
            io.to(socketIdDesktop).emit("desktop_receber_atualizacao_mobile", { itens });
        } else {
            console.log(`> Computador de ${usuarioMinusculo} não encontrado para receber a atualização.`);
        }
    });

    // Limpeza de cache ao desconectar
    socket.on("disconnect", () => {
        if (socket.tipo === "desktop" && caixasAtivos[socket.id_loja]) {
            delete caixasAtivos[socket.id_loja][socket.id_usuario];
        }
        console.log("Cliente desconectado:", socket.id);
    });


    // BUSCA TODAS AS CONEXÕES ATIVAS DO SERVIDOR:
    socket.on("listar_todos_usuarios_globais", () => {
        console.log("-> SERVIDOR RECEBEU O COMANDO DO JAVA!");

        // 1. Obtém o mapa real de sockets ativos na memória local do Node.js
        const todosOsSocketsNativos = io.sockets.sockets;
        
        console.log(`\n=== RELATÓRIO GLOBAL: ${todosOsSocketsNativos.size} CONEXÕES ATIVAS NO SOCKET ===`);
        
        // 2. Iteramos sobre o mapa nativo. O "s" aqui é a instância real do Socket.
        todosOsSocketsNativos.forEach((s) => {
            
            // Verifica se as propriedades injetadas na raiz existem neste socket específico
            if (s.id_loja) {
                console.log(`> Loja: ${s.id_loja} | Usuário: ${s.id_usuario} | Dispositivo: ${s.tipo?.toUpperCase()} | SocketID: ${s.id}`);
            } else {
                console.log(`> Dispositivo conectado mas ainda não identificado/autenticado (SocketID: ${s.id})`);
            }
        });
        
        console.log("===================================================\n");
    });

    socket.on("listar_todas_salas", () => {
        console.log("-> SERVIDOR RECEBEU O COMANDO PARA LISTAR SALAS!");

        // 1. Obtém o mapa de todas as salas e o mapa de todos os sockets conectados
        const salas = io.sockets.adapter.rooms;
        const todosOsSocketsNativos = io.sockets.sockets;

        console.log("\n================ RELATÓRIO DE SALAS ================");

        salas.forEach((setDeSockets, nomeDaSala) => {
            // Filtra para não listar a sala individual automática do próprio socket
            if (!todosOsSocketsNativos.has(nomeDaSala)) {
                
                const totalConectados = setDeSockets.size;
                console.log(`\nSala: [ ${nomeDaSala} ] | Total de Sockets: ${totalConectados}`);

                // 2. Iteramos sobre cada ID de socket dentro desta sala específica
                setDeSockets.forEach((socketId) => {
                    const s = todosOsSocketsNativos.get(socketId);
                    
                    if (s) {
                        if (s.id_loja) {
                            console.log(`  > Loja: ${s.id_loja} | Usuário: ${s.id_usuario} | Dispositivo: ${s.tipo?.toUpperCase()} | SocketID: ${s.id}`);
                        } else {
                            console.log(`  > Dispositivo não identificado (SocketID: ${s.id})`);
                        }
                    }
                });
            }
        });

        console.log("\n===================================================\n");
    });
    /*FIM SOCKET.IO*/

});



    
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

const acessa_Database_Lojas = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "123456",
    database: `lojas`,
});

const dbPixGerados = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "123456",
    database: "pixgerados",
});

//CONFIGURAÇÕES GLOBAL DO EXPRESS (HTTP)
app.use(express.json());
app.use(cors());

// Limitador Global do Express (Afeta apenas Axios/HTTP)
const limiterGlobal = rateLimit({
  windowMs: 5 * 60 * 1000,// Janela menor de 5 minutos (ajuda a liberar o cliente mais rápido se ele for bloqueado)
  limit: 50,// Permite até 300 requisições a cada 5 minutos por IP
  message: { msg: "Muitas requisições detectadas." }// Muito importante: Retorna em formato JSON para não quebrar o Axios/Java/RN

});
app.use(limiterGlobal);

const verificarToken = (req, res, next) => {
    // Pega o token enviado no cabeçalho (Header) da requisição
    const token = req.headers['authorization'];

    if (!token) return res.status(401).send({ msg: "Token não fornecido!" });

    // Remove a palavra 'Bearer ' caso seus sistemas enviem no padrão
    const tokenLimpo = token.startsWith('Bearer ') ? token.slice(7) : token;

    jwt.verify(tokenLimpo, CHAVE_SECRETA, (err, usuarioDecodificado) => {
        if (err) return res.status(403).send({ msg: "Token inválido ou expirado!" });
        
        // MÁGICA: Injeta os dados do token dentro da requisição.
        // Assim, suas rotas antigas continuam funcionando sem mudar uma linha!
        req.body.email = usuarioDecodificado.email;
        req.body.loja_id = usuarioDecodificado.loja_id;
        
        next(); // Autoriza a requisição a ir para a rota real
    });
};

// Como aplicar na rota sem refazer o código interno dela:
app.post('/api/carrinho/atualizar', verificarToken, (req, res) => {
    // req.body.email e req.body.loja_id CONTINUAM EXISTINDO AQUI IGUALZINHO ANTES!
    // Seu código antigo de banco de dados não muda nada.
});

//funcão que valida o token da requisição
function autenticarToken(req, res, next) {

    const authHeader = req.headers["authorization"];

    if (!authHeader) {
        return res.status(401).json({
            msg: "Token não informado."
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            msg: "Token inválido."
        });
    }

    jwt.verify(token, CHAVE_SECRETA, (erro, usuario) => {

        if (erro) {
            return res.status(401).json({
                msg: "Token inválido ou expirado."
            });
        }

        req.usuario = usuario;

        next();
    });
}

app.post("/login", (req, res) => {
    const email = req.body.email;
    const senha = req.body.senha;

    console.log(`${email} solicitou login.`);

    acessa_Database_Lojas.query(
        "SELECT * FROM contas_usuarios WHERE email = ?",
        [email],
        (err, result) => {
            if (err) {
                console.error("Erro ao consultar banco no login:", err);
                return res.status(500).json({ msg: "Erro interno do servidor." });
            }

            if (result.length === 0) {
                return res.status(401).json({ msg: "Nenhuma conta encontrada com este email!" });
            }

            bcrypt.compare(senha, result[0].senha, (erro, senhaBateu) => {
                if (erro) {
                    console.error("Erro ao comparar senha:", erro);
                    return res.status(500).json({ msg: "Erro interno do servidor." });
                }

                if (!senhaBateu) {
                    return res.status(401).json({ msg: "A senha está incorreta!" });
                }

                // Dados que serão colocados no JWT
                const dadosParaOConfigurar = {
                    id_usuario: result[0].id_usuario,   // novo campo incluído
                    email: result[0].email,
                    loja_id: result[0].id_da_loja,
                    nivel: result[0].nivel
                };

                // Gera token
                const token = jwt.sign(dadosParaOConfigurar, CHAVE_SECRETA, {
                    expiresIn: "7d"
                });

                // Login realizado
                //AO FINAL DAS IMPLEMENTAÇÕES DO TOKEN VOU DEIXAR APENAS
                //O CAMPO 'email' no retorno, pois vou utilizar para a comanda 
                //NA TELA DE VENDAS RÁPIDA, O RESTO POSSO DELETAR.
                return res.status(200).json({
                    msg: "Usuário logado com sucesso!",
                    token: token,
                    id_usuario: result[0].id_usuario,   // também devolve no body
                    email: result[0].email,
                    id_da_loja: result[0].id_da_loja,
                    nivel: result[0].nivel
                });
            });
        }
    );
});

/* VERSÃO ANTERIOR DO LOGIN
app.post("/login", (req, res) => {
    const email = req.body.email;
    const senha = req.body.senha;
    console.log(`${email} solicitou login.`);

    acessa_Database_Lojas.query("SELECT * FROM contas_usuarios WHERE email = ?", [email], (err, result) => {
        if (err) {
            return res.send(err); // O return evita que o código continue executando se der erro no banco
        } 
        
        if (result.length > 0) {
            // Alterei o nome da variável interna de 'result' para 'senhaBateu' para não embolar com o resultado do banco
            bcrypt.compare(senha, result[0].senha, (erro, senhaBateu) => {
                if (erro) {
                    return res.send(erro);
                }

                if (senhaBateu) {
                    // 1. Prepara os dados que ficarão escondidos matematicamente dentro do token
                    // ATENÇÃO: Certifique-se de que o nome da coluna no seu banco seja exatamente 'loja_id'
                    const dadosParaOConfigurar = { 
                        email: result[0].email, 
                        loja_id: result[0].id_da_loja,
                        nivel: result[0].nivel //O NÍVEL DE ACESSO DA CONTA QUE ESTÁ LOGANDO.
                    };

                    // 2. Gera o Token configurado para expirar em 7 dias
                    // --- ATENÇÃO, NÃO COLOCAR DADOS SENSIVEIS DENTRO DO TOKEN ---
                    const token = jwt.sign(dadosParaOConfigurar, CHAVE_SECRETA, { expiresIn: '7d' });

                    // 3. Devolve a resposta unificada. Seus sistemas continuam recebendo a msg de sucesso,
                    // mas agora levam também o token, o email e o loja_id para usar nas telas!
                    res.send({
                        msg: "Usuário logado com sucesso!",
                        token: token,
                        email: result[0].email,
                        id_da_loja: result[0].id_da_loja,
                        nivel: result[0].nivel
                    });

                } else {
                    res.send({ msg: "A senha está incorreta!" });
                }
            });
        } else {
            res.send({ msg: "Nenhuma conta encontrada com este email!" });
        }
    });
});
*/

//FUNÇÃO CHAMADA PARA VERIFICAR NIVEL DE ACESSO, E PERMITIR O USUÁRIO ACESSAR UM LOCAL.
app.post("/verificar-acesso", autenticarToken, (req, res) => {
    const nivel = req.usuario.nivel; // vem direto do token
    const recurso = req.body.recurso; // opcional: qual tela/funcionalidade

    // Exemplo simples: só nível 2 acessa controle-da-loja
    if (recurso === "controle-da-loja") {
        if (nivel === 2) {
            return res.status(200).json({ acesso: true });
        } else {
            return res.status(403).json({ acesso: false, msg: "Você não tem permissão para acessar esta tela." });
        }
    }else if(recurso === "financeiro"){// Exemplo simples: só nível 3 acessa financeiro
        if (nivel === 3) {
            return res.status(200).json({ acesso: true });
        } else {
            return res.status(403).json({ acesso: false, msg: "Você não tem permissão para acessar esta tela." });
        }
    }else {
        return res.status(400).json({ acesso: false, msg: "Recurso inválido ou não configurado." });
    }
    // Para outros recursos, pode expandir lógica
    return res.status(200).json({ acesso: true });
});


/* FUNÇÃO DESCONTINUADA.
app.post('/pega-id-loja', (req, res) => {
    const email = req.body.email;

    acessa_Database_Lojas.query("SELECT * FROM contas_usuarios WHERE email= ?",[email], (error, result) => { 
        if(error){
            console.log(error);
            res.send(error)
        }else{
            console.log(result[0])
            res.send(result[0])
        }
    })
})*/

app.post("/cadastro", (req, res) => {
    const { email, senha, nivel, cpf } = req.body;
    const emailFormatado = email.trim().toLowerCase();

    // 1. Inicia transação
    acessa_Database_Lojas.getConnection((errConexao, conn) => {
        if (errConexao) {
            console.error("Erro ao obter conexão:", errConexao);
            return res.status(500).json({ msg: "Erro interno do servidor." });
        }

        conn.beginTransaction(async (errTransaction) => {
            if (errTransaction) {
                conn.release();
                return res.status(500).json({ msg: "Erro ao iniciar transação." });
            }

            try {
                // ETAPA 1: Criar empresa provisória
                conn.query(
                    "INSERT INTO empresas (nome_fantasia, tipo_loja, cidade, estado) VALUES (?, ?, ?, ?)",
                    ["Minha Empresa", "pdv", "Não Informada", "NI"],
                    async (errEmpresa, empresaResult) => {
                        if (errEmpresa) {
                            return conn.rollback(() => {
                                conn.release();
                                res.status(500).json({ msg: "Erro ao criar empresa." });
                            });
                        }

                        const novoIdDaLoja = empresaResult.insertId;

                        // ETAPA 2: Criptografar senha e criar usuário
                        bcrypt.hash(senha, saltRounds, (erroHash, hash) => {
                            if (erroHash) {
                                return conn.rollback(() => {
                                    conn.release();
                                    res.status(500).json({ msg: "Erro ao criptografar senha." });
                                });
                            }

                            conn.query(
                                "INSERT INTO contas_usuarios (id_da_loja, senha, email, nivel, cpf) VALUES (?, ?, ?, ?, ?)",
                                [novoIdDaLoja, hash, emailFormatado, nivel, cpf],
                                (errUsuario) => {
                                    if (errUsuario) {
                                        return conn.rollback(() => {
                                            conn.release();

                                            // Tratamento de duplicidade pelo índice único
                                            if (errUsuario.code === "ER_DUP_ENTRY") {
                                                return res.status(409).json({ msg: "Já existe uma conta cadastrada com este email!" });
                                            }

                                            res.status(500).json({ msg: "Erro ao criar usuário." });
                                        });
                                    }

                                    // ETAPA 3: Inserir status inicial do plano
                                    const dataFutura = calcularDataFutura(7);
                                    const dataFuturaTratada = dataFutura.toISOString().split("T")[0];

                                    conn.query(
                                        "INSERT INTO status_planos (id_da_loja, email, metodo_de_pagamento, status, descricao_do_plano, preco, data_de_inicio, data_de_vencimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                        [novoIdDaLoja, emailFormatado, "indefinido", "ativo", "desbravador", 0.00, dataSistema(), dataFuturaTratada],
                                        (errPlano) => {
                                            if (errPlano) {
                                                return conn.rollback(() => {
                                                    conn.release();
                                                    res.status(500).json({ msg: "Erro ao criar plano inicial." });
                                                });
                                            }

                                            conn.commit((errCommit) => {
                                                if (errCommit) {
                                                    return conn.rollback(() => {
                                                        conn.release();
                                                        res.status(500).json({ msg: "Erro ao finalizar transação." });
                                                    });
                                                }

                                                conn.release();
                                                res.status(200).json({ msg: "Cadastrado com sucesso!" });
                                            });
                                        }
                                    );
                                }
                            );
                        });
                    }
                );
            } catch (errInterno) {
                conn.rollback(() => {
                    conn.release();
                    console.error("Erro interno:", errInterno);
                    res.status(500).json({ msg: "Erro interno ao cadastrar." });
                });
            }
        });
    });
});


/*FUNÇÃO ANTIGA
app.post("/cadastro", (req, res) => {
    email_global = req.body.email;
    const senha = req.body.senha;
    const email = req.body.email.trim().toLowerCase();
    const nivel = req.body.nivel;
    const cpf = req.body.cpf;

    // 1. Validação inicial do e-mail (Direto do Pool)
    acessa_Database_Lojas.query("SELECT id_usuario FROM contas_usuarios WHERE email = ?", [email], (err, result) => {
        if (err) return res.send(err);
        if (result.length > 0) return res.send({ msg: "Já existe uma conta cadastrada com este email!" });

        // Extrai uma conexão física do Pool utilizando a variável limpa 'conn'
        acessa_Database_Lojas.getConnection((errConexao, conn) => {
            if (errConexao) {
                console.error("Erro ao obter conexão do Pool:", errConexao);
                return res.send(errConexao);
            }

            // 2. INICIA A TRANSAÇÃO NA CONEXÃO EXCLUSIVA
            conn.beginTransaction((errTransaction) => {
                if (errTransaction) {
                    conn.release(); // Libera a conexão em caso de falha imediata
                    return res.send(errTransaction);
                }

                // ETAPA 1: Criar a empresa provisória usando 'conn'
                const sqlEmpresa = "INSERT INTO empresas (nome_fantasia, tipo_loja, cidade, estado) VALUES (?, ?, ?, ?)";
                const valoresEmpresa = ["Minha Empresa", "pdv", "Não Informada", "NI"];

                conn.query(sqlEmpresa, valoresEmpresa, (errEmpresa, responseEmpresa) => {
                    if (errEmpresa) {
                        return conn.rollback(() => {
                            conn.release();
                            res.send(errEmpresa);
                        });
                    }

                    // Captura o ID gerado automaticamente pelo AUTO_INCREMENT
                    const novoIdDaLoja = responseEmpresa.insertId;

                    // Criptografa a senha com bcrypt
                    bcrypt.hash(senha, saltRounds, (erroHash, hash) => {
                        if (erroHash) {
                            return conn.rollback(() => {
                                conn.release();
                                res.send(erroHash);
                            });
                        }

                        // ETAPA 2: Criar o usuário apontando para o id_da_loja gerado usando 'conn'
                        const sqlUsuario = "INSERT INTO contas_usuarios (id_da_loja, senha, email, nivel, cpf) VALUES (?, ?, ?, ?, ?)";
                        const valoresUsuario = [novoIdDaLoja, hash, email, nivel, cpf];

                        conn.query(sqlUsuario, valoresUsuario, (errUsuario, responseUsuario) => {
                            if (errUsuario) {
                                return conn.rollback(() => {
                                    conn.release();
                                    res.send(errUsuario);
                                });
                            }

                            //INSERE O STATUS INICIAL DO PLANO DESBRAVADOR DA LOJA.
                            //Faço ele ao final, porque não interfere em nada no uso inicial do app cliente.
                            const dataFutura = calcularDataFutura(7)
                            /*A função .toISOString() do JavaScript sempre converte a data para o fuso horário UTC (Horário de Londres/Greenwich). Como o Brasil está 3 horas atrás do UTC (fuso -3), se um lojista se cadastrar no seu sistema em um fim de noite (por exemplo, às 21h30 em Camaçari), o .toISOString() vai entender que já passou da meia-noite em Londres e vai pular o dia da data de vencimento uma diária para a frente por engano. /
                            //MAS VOU MANTER POR CONTA DA FUNCAO -DESBLOQUEIO DE CONFIANÇA- DO SISTEMA.
                            //MESMO QUE FIQUE UM DIA A MAIS OU A MENOS, O USUÁRIO TEM 7DIAS BÓNUS MESMO.
                            const dataFuturaTratada = (dataFutura.toISOString().split('T')[0])

                            const sqlPlanoInicial = "INSERT INTO status_planos(id_da_loja,email,metodo_de_pagamento,status,descricao_do_plano,preco,data_de_inicio,data_de_vencimento) values(?,?,?,?,?,?,?,?)"
                            const valoresPlanos = [novoIdDaLoja, email, "indefinido", "ativo", "desbravador", 0.00,`${dataSistema()}`,`${dataFuturaTratada}`]
                            conn.query(sqlPlanoInicial, valoresPlanos, (errPlanoInicial, responsePlanoInicial) => {
                                if(errPlanoInicial){
                                    return conn.rollback(() => {
                                        conn.release();
                                        res.send(errPlanoInicial);
                                    })
                                }

                                // 3. SE TUDO DEU CERTO, PERSISTE OS DADOS DEFINITIVAMENTE NO BANCO
                                conn.commit((errCommit) => {
                                    if (errCommit) {
                                        return conn.rollback(() => {
                                            conn.release();
                                            res.send(errCommit);
                                        });
                                    }

                                    // Libera a conexão de volta para o Pool após o sucesso absoluto
                                    conn.release();

                                    // Retorno de sucesso para o cliente
                                    res.send({ msg: "Cadastrado com sucesso!" });
                                })
                            
                            });
                        });
                    });
                });
            });
        });
    });
});*/


//NOVA FUNCAO REFATORADA COM TOKEN!
app.post("/cadastrar-produto", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id; // vem do token

    const codigo_produto = req.body.codigo_produto;
    const produto = req.body.produto;
    const tamanho_produto = req.body.tamanho_produto;
    const estoque = req.body.estoque;
    const preco_compra = req.body.valor_de_compra;
    const preco_venda = req.body.valor_de_venda;
    const local_armazenamento = req.body.local_armazenamento;

    //console.log(`Tentando cadastrar produto na loja: ${id_da_loja}`);

    acessa_Database_Lojas.query(
        `SELECT codigo_produto 
         FROM produtos 
         WHERE loja_id = ? AND codigo_produto = ?`,
        [id_da_loja, codigo_produto],
        (error, result) => {
            if (error) {
                console.error("Erro ao verificar produto existente:", error);
                return res.status(500).json({ msg: "Erro interno do servidor." });
            }

            if (result.length > 0) {
                return res.status(409).json({
                    msg: "Já existe um produto cadastrado com esse código!"
                });
            }

            acessa_Database_Lojas.query(
                `INSERT INTO produtos
                    (loja_id, codigo_produto, nome, tamanho, estoque, preco_compra, preco_venda, local_armazenamento) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id_da_loja,
                    codigo_produto,
                    produto,
                    tamanho_produto,
                    estoque,
                    preco_compra,
                    preco_venda,
                    local_armazenamento
                ],
                (error) => {
                    if (error) {
                        console.error("Erro ao cadastrar produto:", error);
                        return res.status(500).json({
                            msg: "Erro interno do servidor."
                        });
                    }

                    console.log(`Novo produto cadastrado com sucesso na loja: ${id_da_loja}`);
                    return res.status(200).json({
                        msg: "Produto cadastrado com sucesso!"
                    });
                }
            );
        }
    );
});


/*VERSÃO ANTERIOR SEM TOKEN
app.post("/cadastrar-produto", (req,res) => {
    const id_da_loja = req.body.id_da_loja;

    const codigo_produto = req.body.codigo_produto;
    const produto = req.body.produto;
    const tamanho_produto = req.body.tamanho_produto;
    const estoque = req.body.estoque;
    const preco_compra = req.body.valor_de_compra;
    const preco_venda = req.body.valor_de_venda;
    const local_armazenamento = req.body.local_armazenamento;

    console.log(id_da_loja);

    acessa_Database_Lojas.query(`SELECT codigo_produto FROM produtos WHERE loja_id = ? AND codigo_produto = ?`, [id_da_loja, codigo_produto] ,(error, result) => {
        if(error){
            console.log(`Erro: ${error}`)
            res.send({msg:"Erro"})
        }if(result.length > 0){
            res.send({msg:"Já existe um produto cadastrado com esse código!"})
        }else{
            acessa_Database_Lojas.query("INSERT INTO produtos(loja_id, codigo_produto, nome, tamanho, estoque, preco_compra, preco_venda, local_armazenamento) VALUES (?,?,?,?,?,?,?,?)",[id_da_loja, codigo_produto, produto, tamanho_produto, estoque, preco_compra, preco_venda, local_armazenamento],(error) => {
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
})*/

//NOVA FUNCAO REFATORADA! CUIDADO AO USAR ESSA FUNÇÃO, TENHO OUTRA COM O NOME 'BUSCA_PRODUTOS' QUE É PARA BUSCAR A LISTA DOS MESMOS.
//FUNÇÃO UTILIZANDO O TOKEN.
app.post("/buscar-produto", autenticarToken, (req, res) => {

    const codigoProduto = req.body.codigoProduto;
    const buscaPeloCodigo = req.body.modoDeBusca;

    // A loja agora vem do token validado
    const id_da_loja = req.usuario.loja_id;

    // Executa as ações baseadas na demanda
    if (buscaPeloCodigo == false) {

        // Busca pelo código do produto
        acessa_Database_Lojas.query(
            `SELECT * FROM produtos 
             WHERE loja_id = ? AND codigo_produto = ?`,
            [id_da_loja, codigoProduto],
            (error, result) => {

                // Erro no banco
                if (error) {

                    console.error(
                        "Erro ao buscar produto pelo código:",
                        error
                    );

                    return res.status(500).json({
                        msg: "Ocorreu um erro ao tentar buscar o produto desejado!"
                    });
                }

                // Nenhum produto encontrado
                if (result.length === 0) {

                    console.log("Nenhum resultado encontrado!");

                    return res.status(404).json({
                        msg: "Nenhum resultado encontrado!"
                    });
                }

                // Produto encontrado
                return res.status(200).json([
                    {
                        codigo_produto: result[0].codigo_produto,
                        produto: result[0].nome,
                        preco: result[0].preco_venda,
                        estoque: result[0].estoque,
                        valor_de_compra: result[0].preco_compra
                    }
                ]);
            }
        );

    } else {

        // Busca pelo nome do produto
        acessa_Database_Lojas.query(
            `SELECT * FROM produtos 
             WHERE loja_id = ? AND nome LIKE ?`,
            [id_da_loja, `%${codigoProduto}%`],
            (error, result) => {

                // Erro no banco
                if (error) {

                    console.error(
                        "Erro ao buscar produto pelo nome:",
                        error
                    );

                    return res.status(500).json({
                        msg: "Ocorreu um erro ao tentar buscar o produto desejado!"
                    });
                }

                // LISTA COM OS PRODUTOS ENCONTRADOS
                const listaProdutos = [];

                if (result.length === 0) {

                    console.log("Nenhum resultado encontrado!");

                    return res.status(404).json({
                        msg: "Nenhum resultado encontrado!"
                    });
                }

                for (let r = 0; r < result.length; r++) {

                    listaProdutos.push({
                        codigo_produto: result[r].codigo_produto,
                        produto: result[r].nome,
                        preco: result[r].preco_venda,
                        estoque: result[r].estoque,
                        valor_de_compra: result[r].preco_compra
                    });
                }

                console.log(listaProdutos);

                return res.status(200).json(listaProdutos);
            }
        );
    }
});

/*FUNÇÃO ANTIGA, SEM PEGAR DADOS DO TOKEN
app.post("/buscar-produto", (req,res) => { 
    const codigoProduto = req.body.codigoProduto;
    const id_da_loja = req.body.id_da_loja;
    const buscaPeloCodigo = req.body.modoDeBusca;//INFORMA SE O SERVIDOR DEVE BUSCAR PELO CÓDIGO OU PELO NOME DO PRODUTO.
    
    //Executa as ações baseadas na demanda.
    if(buscaPeloCodigo == false){ //Caso tenha apenas números no código, busca pelo código.
        acessa_Database_Lojas.query(`SELECT * FROM produtos WHERE loja_id = ? AND codigo_produto = ?`,[id_da_loja, codigoProduto], (error, result) => {
            if(error){
                res.send({msg:"Ocorreu um erro ao tentar buscar o produto desejado!"})
                console.log(error)
            }else{
                if(result.length > 0){
                    res.send([{ codigo_produto: result[0].codigo_produto, produto: result[0].nome, preco: result[0].preco_venda, estoque: result[0].estoque, valor_de_compra: result[0].preco_compra},])  
                    //console.log({ codigo_produto: result[0].codigo_produto, produto: result[0].produto, preco: result[0].valor_de_venda, estoque: result[0].estoque },)
                }else{
                    res.send({msg:"Nenhum resultado encontrado!"})
                    console.log("Nenhum resultado encontrado!")  
                }  
            }
        })
    }else{//Em outros casos, busca pelo nome também.
        acessa_Database_Lojas.query(`SELECT * FROM produtos WHERE loja_id = ? AND nome LIKE ?`,[id_da_loja, `%${codigoProduto}%`], (error, result) => {
            if(error){
                res.send({msg:"Ocorreu um erro ao tentar buscar o produto desejado!"})
                console.log(error) 
            }else{
                //LISTA COM OS PRODUTOS ENCONTRADOS NO BANCO DE DADOS!
                var listaProdutos = [];
                if(result.length > 0){
                    for(r = 0; r < result.length; r++){
                        listaProdutos.push({ codigo_produto: result[r].codigo_produto, produto: result[r].nome, preco: result[r].preco_venda, estoque: result[r].estoque, valor_de_compra: result[r].preco_compra},)
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
})*/

//NOVA FUNCAO REFATORADA!
//Fornece as informacoes dos produtos vendidos para a tela: Produtos Vendidos.
app.post("/busca_produtos_vendidos_por_data", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id; // vem do token
    const { dataDia, dataMes, dataAno } = req.body;

    let dataInicio, dataFim;

    if (dataDia && dataMes && dataAno) {
        // Busca por dia específico
        dataInicio = `${dataAno}-${dataMes}-${dataDia}`;
        const fim = new Date(dataInicio);
        fim.setDate(fim.getDate() + 1);
        dataFim = fim.toISOString().slice(0, 10);

    } else if (!dataDia && dataMes && dataAno) {
        // Busca por mês e ano
        dataInicio = `${dataAno}-${dataMes}-01`;
        const fim = new Date(`${dataAno}-${dataMes}-01T00:00:00`);
        fim.setMonth(fim.getMonth() + 1);
        dataFim = fim.toISOString().slice(0, 10);

    } else if (!dataDia && !dataMes && dataAno) {
        // Busca por ano
        dataInicio = `${dataAno}-01-01`;
        dataFim = `${dataAno}-12-31`;
    } else {
        return res.status(400).json({ msg: "Parâmetros de data inválidos." });
    }

    const sql = `
        SELECT 
            vi.produto_id,
            vi.produto_nome,
            SUM(vi.quantidade) AS total_unidades,
            SUM(vi.subtotal) AS faturamento,
            SUM(vi.subtotal - vi.preco_compra) AS lucro
        FROM vendas v
        JOIN vendas_itens vi ON vi.venda_id = v.id
        WHERE v.loja_id = ?
        AND v.data_venda >= ?
        AND v.data_venda < ?
        GROUP BY vi.produto_id, vi.produto_nome
        ORDER BY faturamento DESC;
    `;

    acessa_Database_Lojas.query(sql, [id_da_loja, dataInicio, dataFim], (error, result) => {
        if (error) {
            console.error("Erro ao buscar vendas:", error);
            return res.status(500).json({ msg: "Erro interno do servidor." });
        }

        if (result.length === 0) {
            return res.status(404).json({ msg: "Nenhuma venda encontrada no período informado." });
        }

        return res.status(200).json(result);
    });
});

/*VERSÃO ANTIGA SEM TOKEN
app.post("/busca_produtos_vendidos_por_data", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const dataDia = req.body.dataDia;
    const dataMes = req.body.dataMes;
    const dataAno = req.body.dataAno;
    console.log(`dia: ${dataDia} mes ${dataMes} ano: ${dataAno} id_loja: ${id_da_loja}`)
    
    if(dataDia != undefined && dataMes != undefined && dataAno != undefined){//SE A BUSCA FOR POR DIA, MES E ANO.         
        const dataInicio = `${dataAno}-${dataMes}-${dataDia}`;
 
        const dataFim = new Date(dataInicio);
        dataFim.setDate(dataFim.getDate() + 1);
        const dataFimFormatada = dataFim.toISOString().slice(0,10);
        acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                    FROM vendas v
                                    JOIN vendas_itens vi ON vi.venda_id = v.id
                                    WHERE v.loja_id = ?
                                    AND v.data_venda >= ?
                                    AND v.data_venda < ?
                                    GROUP BY vi.produto_id, vi.produto_nome
                                    ORDER BY faturamento DESC;
        `, [id_da_loja, dataInicio, dataFimFormatada],
        (error, result) => {

            if(error){
                console.log("Erro ao buscar vendas do dia:", error);
                res.status(500).send({msg:"Erro"});
            }else{
                console.log(result)
                res.send({msg: result});//MUDAR PARA PASSAR SÓ O RESULT, MAS PRECISO MUDAR COMO OS CLIENT'S RECEBEM. 
            }
        });

    }else if(dataDia == undefined && dataMes != undefined && dataAno != undefined){//Quando a busca foi feita apenas por mês e ano.
        const dataInicio = `${dataAno}-${dataMes}-01`;

        const dataFim = new Date(dataInicio + "T00:00:00"); // força local
        dataFim.setMonth(dataFim.getMonth() + 1); //pega o próximo m
        dataFim.setDate(0);//para pegar o ultimo dia do mês anterior.

        // formata sem timezone bug
        const ano = dataFim.getFullYear();
        const mes = String(dataFim.getMonth() + 1).padStart(2, "0");
        const dia = String(dataFim.getDate()).padStart(2, "0");

        const dataFimFormatada = dataFim.toISOString().slice(0,10);
        console.log(`data inicio: ${dataInicio} data Fim: ${dataFimFormatada}`)
        acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                    FROM vendas v
                                    JOIN vendas_itens vi ON vi.venda_id = v.id
                                    WHERE v.loja_id = ?
                                    AND v.data_venda >= ?
                                    AND v.data_venda < ?
                                    GROUP BY vi.produto_id, vi.produto_nome
                                    ORDER BY faturamento DESC;
        `, [id_da_loja, dataInicio, dataFimFormatada],
        (error, result) => {

            if(error){
                console.log("Erro ao buscar vendas do dia:", error);
                res.status(500).send({msg:"Erro"});
            }else{
                console.log(result)
                res.send({msg: result});
            }
        });
        
    }else if(dataDia == undefined && dataMes == undefined && dataAno != undefined){//Quando a busca é feita buscando apenas pelo ano 
        
        const dataInicio = `${dataAno}-01-01`;
        const dataFim = `${dataAno}-12-31`;

        console.log(`data inicio: ${dataInicio} data Fim: ${dataFim}`)
        acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                    FROM vendas v
                                    JOIN vendas_itens vi ON vi.venda_id = v.id
                                    WHERE v.loja_id = ?
                                    AND v.data_venda >= ?
                                    AND v.data_venda < ?
                                    GROUP BY vi.produto_id, vi.produto_nome
                                    ORDER BY faturamento DESC;
        `, [id_da_loja, dataInicio, dataFim],
        (error, result) => {

            if(error){
                console.log("Erro ao buscar vendas do dia:", error);
                res.status(500).send({msg:"Erro"});
            }else{
                console.log(result)
                res.send({msg: result});
            }
        });
    }
})*/

//NOVA FUNCAO REFATORADA!
/*Fornece as informacoes de produtos ESPECIFICOS para a tela: Produtos Vendidos.
AS VEZES O CLIENTE QUER BUSCAR PELO NOME OU CÓDIGO DO PRODUTO.*/
app.post("/busca_produtos_vendidos_especificos_por_data", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id; // vem do token
    const { dataDia, dataMes, dataAno, produto, buscaPorCodigo } = req.body;

    let dataInicio, dataFim;

    if (dataDia && dataMes && dataAno) {
        // Busca por dia
        dataInicio = `${dataAno}-${dataMes}-${dataDia}`;
        const fim = new Date(dataInicio);
        fim.setDate(fim.getDate() + 1);
        dataFim = fim.toISOString().slice(0, 10);

    } else if (!dataDia && dataMes && dataAno) {
        // Busca por mês
        dataInicio = `${dataAno}-${dataMes}-01`;
        const fim = new Date(`${dataAno}-${dataMes}-01T00:00:00`);
        fim.setMonth(fim.getMonth() + 1);
        dataFim = fim.toISOString().slice(0, 10);

    } else if (!dataDia && !dataMes && dataAno) {
        // Busca por ano
        dataInicio = `${dataAno}-01-01`;
        dataFim = `${dataAno}-12-31`;

    } else {
        return res.status(400).json({ msg: "Parâmetros de data inválidos." });
    }

    // Monta filtro de produto
    const filtroProduto = buscaPorCodigo
        ? { sql: "AND vi.produto_nome LIKE ?", valor: `%${produto}%` }
        : { sql: "AND vi.produto_id = ?", valor: produto };

    const sql = `
        SELECT 
            vi.produto_id,
            vi.produto_nome,
            SUM(vi.quantidade) AS total_unidades,
            SUM(vi.subtotal) AS faturamento,
            SUM(vi.subtotal - vi.preco_compra) AS lucro
        FROM vendas v
        JOIN vendas_itens vi ON vi.venda_id = v.id
        WHERE v.loja_id = ?
        AND v.data_venda >= ?
        AND v.data_venda < ?
        ${filtroProduto.sql}
        GROUP BY vi.produto_id, vi.produto_nome
        ORDER BY faturamento DESC;
    `;

    acessa_Database_Lojas.query(sql, [id_da_loja, dataInicio, dataFim, filtroProduto.valor], (error, result) => {
        if (error) {
            console.error("Erro ao buscar vendas:", error);
            return res.status(500).json({ msg: "Erro interno do servidor." });
        }

        if (result.length === 0) {
            return res.status(404).json({ msg: "Nenhuma venda encontrada no período informado." });
        }

        return res.status(200).json(result);
    });
});

/*VERSÃO ANTIGA
app.post("/busca_produtos_vendidos_especificos_por_data", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const dataDia = req.body.dataDia;
    const dataMes = req.body.dataMes;
    const dataAno = req.body.dataAno;
    const produto = req.body.produto;
    const buscaPorCodigo = req.body.buscaPorCodigo;//Aqui recebe true para buscar pelo nome referencia ou false para buscar pelo codigo.
    console.log(`dia: ${dataDia} mes ${dataMes} ano: ${dataAno} produto: ${produto} id_loja: ${id_da_loja}`)
    
    if(dataDia != undefined && dataMes != undefined && dataAno != undefined){//SE A BUSCA FOR POR DIA, MES E ANO.         
        const dataInicio = `${dataAno}-${dataMes}-${dataDia}`;

        const dataFim = new Date(dataInicio);
        dataFim.setDate(dataFim.getDate() + 1);
        const dataFimFormatada = dataFim.toISOString().slice(0,10);
        if(buscaPorCodigo == true){//busca pelo nome de referencia.
            acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                        FROM vendas v
                                        JOIN vendas_itens vi ON vi.venda_id = v.id
                                        WHERE v.loja_id = ?
                                        AND v.data_venda >= ?
                                        AND v.data_venda < ?
                                        AND vi.produto_nome LIKE ?
                                        GROUP BY vi.produto_id, vi.produto_nome
                                        ORDER BY faturamento DESC;                                   
            `, [id_da_loja, dataInicio, dataFim,`%${produto}%`],
            (error, result) => {

                if(error){
                    console.log("Erro ao buscar vendas do dia:", error);
                    res.status(500).send({msg:"Erro"});
                }else{
                    console.log(result)
                    res.send({msg: result});
                }
            });
        }else{//Busca pelo código
            acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                        FROM vendas v
                                        JOIN vendas_itens vi ON vi.venda_id = v.id
                                        WHERE v.loja_id = ?
                                        AND v.data_venda >= ?
                                        AND v.data_venda < ?
                                        AND vi.produto_id = ?
                                        GROUP BY vi.produto_id, vi.produto_nome
                                        ORDER BY faturamento DESC;
                                                                    
            `, [id_da_loja, dataInicio, dataFim, produto],
            (error, result) => {

                if(error){
                    console.log("Erro ao buscar vendas do dia:", error);
                    res.status(500).send({msg:"Erro"});
                }else{
                    console.log(result)
                    res.send({msg: result});
                }
            });
        }

    }else if(dataDia == undefined && dataMes != undefined && dataAno != undefined){//Quando a busca foi feita apenas por mês e ano.
        const dataInicio = `${dataAno}-${dataMes}-01`;

        const dataFim = new Date(dataInicio + "T00:00:00"); // força local
        dataFim.setMonth(dataFim.getMonth() + 1); //pega o próximo m
        dataFim.setDate(0);//para pegar o ultimo dia do mês anterior.

        // formata sem timezone bug
        const ano = dataFim.getFullYear();
        const mes = String(dataFim.getMonth() + 1).padStart(2, "0");
        const dia = String(dataFim.getDate()).padStart(2, "0");

        const dataFimFormatada = dataFim.toISOString().slice(0,10);
        if(buscaPorCodigo == true){//busca pelo nome de referencia.
            acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                        FROM vendas v
                                        JOIN vendas_itens vi ON vi.venda_id = v.id
                                        WHERE v.loja_id = ?
                                        AND v.data_venda >= ?
                                        AND v.data_venda < ?
                                        AND vi.produto_nome LIKE ?
                                        GROUP BY vi.produto_id, vi.produto_nome
                                        ORDER BY faturamento DESC;                                   
            `, [id_da_loja, dataInicio, dataFim,`%${produto}%`],
            (error, result) => {

                if(error){
                    console.log("Erro ao buscar vendas do dia:", error);
                    res.status(500).send({msg:"Erro"});
                }else{
                    console.log(result)
                    res.send({msg: result});
                }
            });
        }else{//Busca pelo código.
            acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                        FROM vendas v
                                        JOIN vendas_itens vi ON vi.venda_id = v.id
                                        WHERE v.loja_id = ?
                                        AND v.data_venda >= ?
                                        AND v.data_venda < ?
                                        AND vi.produto_id = ?
                                        GROUP BY vi.produto_id, vi.produto_nome
                                        ORDER BY faturamento DESC;
                                                                    
            `, [id_da_loja, dataInicio, dataFim, produto],
            (error, result) => {

                if(error){
                    console.log("Erro ao buscar vendas do dia:", error);
                    res.status(500).send({msg:"Erro"});
                }else{
                    console.log(result)
                    res.send({msg: result});
                }
            });
        }
        
    }else if(dataDia == undefined && dataMes == undefined && dataAno != undefined){//Quando a busca é feita buscando apenas pelo ano 
        const dataInicio = `${dataAno}-01-01`;
        const dataFim = `${dataAno}-12-31`;
         
        if(buscaPorCodigo == true){//busca pelo nome de referencia.
            acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                        FROM vendas v
                                        JOIN vendas_itens vi ON vi.venda_id = v.id
                                        WHERE v.loja_id = ?
                                        AND v.data_venda >= ?
                                        AND v.data_venda < ?
                                        AND vi.produto_nome LIKE ?
                                        GROUP BY vi.produto_id, vi.produto_nome
                                        ORDER BY faturamento DESC;                                   
            `, [id_da_loja, dataInicio, dataFim,`%${produto}%`],
            (error, result) => {

                if(error){
                    console.log("Erro ao buscar vendas do dia:", error);
                    res.status(500).send({msg:"Erro"});
                }else{
                    console.log(result)
                    res.send({msg: result});
                }
            });
        }else{//Busca pelo código.
            acessa_Database_Lojas.query(`SELECT 
                                        vi.produto_id,
                                        vi.produto_nome,
                                        SUM(vi.quantidade) AS total_unidades,
                                        SUM(vi.subtotal) AS faturamento,
                                        SUM(vi.subtotal - vi.preco_compra) AS lucro
                                        FROM vendas v
                                        JOIN vendas_itens vi ON vi.venda_id = v.id
                                        WHERE v.loja_id = ?
                                        AND v.data_venda >= ?
                                        AND v.data_venda < ?
                                        AND vi.produto_id = ?
                                        GROUP BY vi.produto_id, vi.produto_nome
                                        ORDER BY faturamento DESC;
                                                                    
            `, [id_da_loja, dataInicio, dataFim, produto],
            (error, result) => {

                if(error){
                    console.log("Erro ao buscar vendas do dia:", error);
                    res.status(500).send({msg:"Erro"});
                }else{
                    console.log(result)
                    res.send({msg: result});
                }
            });
        }
 
        
    }
})*/


//DESCONTINUADA, PODE EXCLUIR.
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

//DESCONTINUADA, PODE EXCLUIR.
async function criaDatabase_Vendas_Da_Loja(){
    db0.query(`CREATE DATABASE IF NOT EXISTS vendas_loja${id_Da_Loja_Global}`,(err) => {
        if(err){
            console.log("Erro ao tentar criar Database")
        }else{
            console.log("Database de vendas da loja criada com sucesso!")          
        }
    })
}

//A NOVA FUNCAO DE FINALIZAR VENDA, COM A REESTRUTURACAO!

//console.log(agora.toLocaleTimeString('pt-BR')); // Ex: 14:30:05
function dataEhoraSistema(){
    const agora = new Date();
    //console.log(agora.toLocaleTimeString('pt-BR'));
    return agora;
}

//DEPOIS VOU SEPARAR ESSAS "FUNCOES" TUDO QUE ESTÃO DENTRO DELA.
app.post("/finalizar-venda", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const listaDosProdutosVendidos = req.body.produtos_Vendidos;
    //PARTE EM TESTE------------
    contador = 0;

    //CALCULA totalVenda & Custo Total.
    let totalVenda = 0;
    let custoTotal = 0;

    console.log(listaDosProdutosVendidos)
    for(let c = 0; c < listaDosProdutosVendidos.length; c++){
        totalVenda += listaDosProdutosVendidos[c][3]
        custoTotal += listaDosProdutosVendidos[c][4] * listaDosProdutosVendidos[c][2]
    }
    //console.log(`total Venda: ${totalVenda}`)
    //console.log(`custo total: ${custoTotal}`)
    //----------------------------------------------------

    acessa_Database_Lojas.getConnection((err, conn) => {
        if (err) {
            console.log(err);
            return res.send({ msg: 'Erro conexão' });
        }
        //INICIO A TRANSAÇÃO
        conn.beginTransaction(err => {
            if (err) {
                conn.release();
                return res.send({ msg: 'Erro transação' });
            }
            //INSIRO OS DADOS DA VENDA.
            conn.query(`
            INSERT INTO vendas (loja_id, data_venda, hora_venda, total, custo_total)
            VALUES (?, ?, ?, ?, ?)
            `, [id_da_loja, dataEhoraSistema(), dataEhoraSistema(), totalVenda, custoTotal],
            (erro, result) => {

            if (erro) {
                return conn.rollback(() => {
                conn.release();
                console.log(erro);
                res.send({ msg: 'Erro!' });
                });
            }

            const vendaId = result.insertId;

            //INSIRO OS ITENS QUE FORAM VENDIDOS.
            const itens = listaDosProdutosVendidos.map(p => [
                vendaId,
                p[0],//produto_id
                p[1],//produto_nome
                p[2],//quantidade
                p[3],//preco_venda
                p[4] * p[2],//preco_compra
                p[3]//subtotal
            ]);

            conn.query(`
                INSERT INTO vendas_itens
                (venda_id, produto_id, produto_nome, quantidade, preco_venda, preco_compra, subtotal)
                VALUES ?
            `, [itens], erro => {

            if (erro) {
            return conn.rollback(() => {
                conn.release();
                console.log(erro);
                res.send({ msg: 'Erro!' });
            });
            }

            //REMOVE ESTOQUE.
            let processados = 0;

            listaDosProdutosVendidos.forEach(p => {

                const produtoId = p[0];
                const qtdVendida = p[2];
                console.log(`produto id: ${produtoId} id da loja nesta operação: ${id_da_loja}`)
                conn.query(`
                    UPDATE produtos
                    SET estoque = estoque - ?
                    WHERE loja_id = ? AND codigo_produto = ?
                `, [qtdVendida, id_da_loja, produtoId], (erro) => {

                    if (erro) {
                        return conn.rollback(() => {
                            conn.release();
                            console.log(erro);
                            res.send({ msg: 'Erro!' });
                        });
                    }

                    processados++;

                    // quando todos forem atualizados → commit
                    if (processados === listaDosProdutosVendidos.length) {

                        conn.commit(err => {
                            if (err) {
                                return conn.rollback(() => {
                                    conn.release();
                                    console.log(err);
                                    res.send({ msg: 'Erro!' });
                                });
                            }

                        });
                    }
                });
            });

            
            //FINALIZO A TRANSIÇÃO.
            conn.commit(err => {
                if (err) {
                    return conn.rollback(() => {
                    conn.release();
                    console.log(err);
                    res.send({ msg: 'Erro!' });
                    });
                }

                conn.release(); 
                //Envio o sinal socket.io
                io.to(`loja_${id_da_loja}`).emit("finalizou_venda");

                res.send({ msg: 'Sucesso!' });
            });

            });

            });
        });
    });
})

//DEPOIS VOU SEPARAR ESSAS "FUNCOES" TUDO QUE ESTÃO DENTRO DELA.
//O FINALIZAR VENDA POR COMANDA É DIFERENTE! 
app.post("/finalizar-comanda", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id;
    const comanda = req.usuario.email;
    const venda_id = req.body.venda_id;
    const itens = req.body.itens;

    if (!venda_id || !Array.isArray(itens)) {
        return res.status(400).json({
            msg: "Dados inválidos para finalizar a comanda."
        });
    }

    itens.forEach(item => {
        acessa_Database_Lojas.query(
            `UPDATE vendas_itens 
             SET quantidade = ?, preco_venda = ?, preco_compra = ?, subtotal = ?
             WHERE venda_id = ? AND produto_id = ?`,
            [
                item.quantidade,
                item.preco_venda,
                item.preco_compra,
                item.quantidade * item.preco_venda,
                venda_id,
                item.produto_id
            ],
            (error) => {
                if (error) {
                    console.error("Erro ao atualizar item da comanda:", error);
                }
            }
        );
    });

    acessa_Database_Lojas.query(
        `UPDATE mesas SET status = 'finalizada' WHERE loja_id = ? AND identificador = ?`,
        [id_da_loja, comanda],
        (error) => {
            if (error) {
                console.error("Erro ao finalizar comanda:", error);
                return res.status(500).json({
                    msg: "Erro interno do servidor."
                });
            }

            return res.status(200).json({
                msg: "Comanda finalizada com sucesso"
            });
        }
    );
});


/* FUNCAO ANTIGA SEM TOKEN
app.post("/finalizar-comanda", (req, res) => { 

    const loja_id = req.body.loja_id;
    const venda_id = req.body.venda_id; 
    const identificador = req.body.identificador;

    const id_usuario = req.body.id_usuario;
    const id_usuarioMinusculo = String(id_usuario?.toLowerCase());

    console.log(`loja_id: ${loja_id} | venda_id: ${venda_id} | identificador: ${identificador}`)
 
    acessa_Database_Lojas.getConnection((err, conn) => {

        if (err) {
            console.log(err);
            return res.send({ msg: 'Erro conexão' });
        }

        conn.beginTransaction(err => {

            if (err) {
                conn.release();
                return res.send({ msg: 'Erro transação' });
            }

            // 1️ Calcula total e custo baseado nos itens já existentes
            conn.query(`
                SELECT 
                    SUM(subtotal) AS total,
                    SUM(preco_compra * quantidade) AS custo_total
                FROM vendas_itens
                WHERE venda_id = ?
            `, [venda_id], (erro, resultado) => {

                if (erro) {
                    return conn.rollback(() => {
                        conn.release();
                        console.log(erro);
                        res.send({ msg: 'Erro calcular totais' });
                    });
                }

                const total = resultado[0].total || 0;
                const custo_total = resultado[0].custo_total || 0;

                // 2️ Atualiza a venda como finalizada
                conn.query(` 
                    UPDATE vendas
                    SET 
                        total = ?,
                        custo_total = ?,
                        status = 'fechada',
                        data_venda = ?,
                        hora_venda = ?
                    WHERE id = ?
                    AND loja_id = ?
                `, [total, custo_total, dataEhoraSistema(), dataEhoraSistema(), venda_id, loja_id], erro => {

                    if (erro) {
                        return conn.rollback(() => {
                            conn.release();
                            console.log(erro);
                            res.send({ msg: 'Erro atualizar venda' });
                        });
                    }

                    // 3️ Remove da tabela mesas (fecha comanda)
                    conn.query(`
                        DELETE FROM mesas
                        WHERE venda_id = ?
                        AND loja_id = ?
                        AND identificador = ?
                    `, [venda_id, loja_id, identificador], erro => {

                        if (erro) {
                            return conn.rollback(() => {
                                conn.release();
                                console.log(erro);
                                res.send({ msg: 'Erro remover mesa' });
                            });
                        }

                        // 4️ Commit final
                        conn.commit(err => {

                            if (err) {
                                return conn.rollback(() => {
                                    conn.release();
                                    console.log(err);
                                    res.send({ msg: 'Erro commit' });
                                });
                            }

                            conn.release();
 
                            /*
                            AO FINALIZAR A VENDA AQUI, VERIFICO SE A COMANDA DESSA VENDA ESTÁ ABERTA NO OUTRO
                            COMPUTADOR/CELULAR, SE TIVER COM ESSA COMANDA EM USO, EU FECHO A TELA, PARA QUE 
                            NÃO TENHA UMA TELA DESATUALIZADA NO OUTRO.
                            posso passar o identificador, para que o pc/celular ao receber a notificacao
                            verifique se está com a comanda aberta e se tiver, fechar
                             /
                            //vou criar outro io.to que vai passar a loja e o identificador, para repassar ao finalizar
                            //no front, se o id e o identificador bater com o que o usuario está utilizando na tela de vendas
                            //eu fecho/limpo ela lá
                            //Envio o sinal socket.io
                            //passo o identificador, para o front verificar.
                            // 1. CANAL PRIVADO: Limpa a tela APENAS do computador e celular desse usuário
                            // Enviamos para a sala do usuário. Quem estiver nela e com essa comanda aberta vai fechar a tela.
                            io.to(`loja_${loja_id}_usuario_${id_usuarioMinusculo}`).emit("comando_limpar_tela_venda", {
                                identificador: id_usuarioMinusculo
                            });//utilizado na tela de venda rápida 
 
                            //-------------------------- UTILIZADA PARA TODOS OS USUÁRIOS DA LOJA --------------------------
                            io.to(`loja_${loja_id}`).emit("finalizou_venda");

                            
                            res.send({ msg: 'Comanda finalizada com sucesso!' });

                        });

                    });

                });

            });

        });

    });

});*/

//FUNCAO JA REFATORADA.
app.post("/busca-Vendas-Do-Dia", (req,res) => { 
    const id_da_loja = req.body.id_da_loja;
    
    acessa_Database_Lojas.query(`SELECT SUM(total) AS faturamento, SUM(custo_total) AS custo
                                FROM vendas WHERE loja_id = ? AND data_venda = CURDATE();
        `,[id_da_loja], 
        (error, result) => {
        if(error){
            console.log("Erro ao somar total de vendas." + error)
            console.log({msg:"Erro!"})
        }else{        
            const resultado = result;
            if(resultado != null){  //SE TIVER ALGUM VALOR EM VENDA MAIOR QUE 0.
                res.send({msg: resultado})
            }else{
                res.send({msg:"Nenhum faturamento hoje."})
            } 
        }

    })
})

//Essa função é a utilizada na tela faturamento e lucro
//FUNCAO JÁ REFATORADA.
app.post("/busca-Vendas-Por-Data", (req, res) =>{
    const id_da_loja = req.body.id_da_loja;
    const dataDia = req.body.dataDia;
    const dataMes = req.body.dataMes;
    const dataAno = req.body.dataAno;
    console.log(`dia: ${dataDia} mes ${dataMes} ano: ${dataAno} id_loja: ${id_da_loja}`)
    
    if(dataDia != undefined && dataMes != undefined && dataAno != undefined){//SE A BUSCA FOR POR DIA, MES E ANO.         
        const dataInicio = `${dataAno}-${dataMes}-${dataDia}`;

        const dataFim = new Date(dataInicio);
        dataFim.setDate(dataFim.getDate() + 1);
        const dataFimFormatada = dataFim.toISOString().slice(0,10);
        acessa_Database_Lojas.query(`SELECT SUM(total) AS faturamento,
                                    SUM(custo_total) AS custo FROM vendas WHERE loja_id = ? 
                                    AND data_venda >= ? AND data_venda < ?
        `, [id_da_loja, dataInicio, dataFimFormatada],
        (error, result) => {

            if(error){
                console.log("Erro ao buscar vendas do dia:", error);
                res.status(500).send({msg:"Erro"});
            }else{
                console.log(result)
                res.send({msg: result});
            }
        });

    }else if(dataDia == undefined && dataMes != undefined && dataAno != undefined){//Quando a busca foi feita apenas por mês e ano.
        const dataInicio = `${dataAno}-${dataMes}-01`;

        const dataFim = new Date(dataInicio);
        dataFim.setMonth(dataFim.getMonth() + 1);
        const dataFimFormatada = dataFim.toISOString().slice(0,10);

        acessa_Database_Lojas.query(`
            SELECT SUM(total) AS faturamento, SUM(custo_total) AS custo FROM vendas
            WHERE loja_id = ? AND data_venda >= ? AND data_venda < ?
        `, [id_da_loja, dataInicio, dataFimFormatada],
        (error, result) => {

            if(error){
                console.log("Erro ao buscar vendas do mês:", error);
                res.status(500).send({msg:"Erro"});
            }else{
                console.log(result)
                res.send({msg: result});
            }
        });
        
    }else if(dataDia == undefined && dataMes == undefined && dataAno != undefined){//Quando a busca é feita buscando apenas pelo ano 
        
        const dataInicio = `${dataAno}-01-01`;
        const dataFim = `${Number(dataAno) + 1}-01-01`;

        acessa_Database_Lojas.query(`
            SELECT SUM(total) AS faturamento, SUM(custo_total) AS custo FROM vendas
            WHERE loja_id = ? AND data_venda >= ? AND data_venda < ?
        `, [id_da_loja, dataInicio, dataFim],
        (error, result) => {

            if(error){
                console.log("Erro ao buscar vendas do ano:", error);
                res.status(500).send({msg:"Erro"});
            }else{
                res.send({msg: result});
            }
        });
    }
})

//FUNCAO REFATORADA.
app.post("/adicionar-estoque", autenticarToken, (req, res) => { 
    const id_da_loja = req.usuario.loja_id; // vem do token
    const codigoProduto = req.body.codigoProduto;
    const novoEstoque = req.body.novoEstoque;

    acessa_Database_Lojas.query(
        `UPDATE produtos 
         SET estoque = estoque + ?
         WHERE loja_id = ? AND codigo_produto = ?;`,
        [novoEstoque, id_da_loja, codigoProduto],
        (error) => {
            if (error) {
                console.error("Erro ao tentar alterar o estoque:", error);
                return res.status(500).json({ msg: "Erro interno do servidor." });
            }

            // Busca estoque atualizado
            acessa_Database_Lojas.query(
                `SELECT estoque 
                 FROM produtos
                 WHERE loja_id = ? AND codigo_produto = ?`,
                [id_da_loja, codigoProduto],
                (err2, result) => {
                    if (err2) {
                        console.error("Erro ao buscar estoque atualizado:", err2);
                        return res.status(500).json({ msg: "Erro interno do servidor." });
                    }

                    if (result.length === 0) {
                        return res.status(404).json({ msg: "Produto não encontrado." });
                    }

                    const estoqueAtual = result[0].estoque;

                    // Envia sinal via socket.io
                    io.to(`loja_${id_da_loja}`).emit("estoque_atualizado", {
                        codigoProduto,
                        estoque: estoqueAtual
                    });

                    console.log(`Estoque atualizado para produto ${codigoProduto} na loja ${id_da_loja}: ${estoqueAtual}`);

                    return res.status(200).json({
                        msg: "Estoque atualizado com sucesso!",
                        codigoProduto,
                        estoque: estoqueAtual
                    });
                }
            );
        }
    );   
});

app.post("/remover-estoque", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id; // vem do token
    const codigoProduto = req.body.codigoProduto;
    const novoEstoque = req.body.novoEstoque;

    acessa_Database_Lojas.query(
        `UPDATE produtos 
         SET estoque = estoque - ?
         WHERE loja_id = ? AND codigo_produto = ? AND estoque >= ?;`,
        [novoEstoque, id_da_loja, codigoProduto, novoEstoque],
        (error, result) => {
            if (error) {
                console.error(`Erro ao tentar alterar o estoque da loja ${id_da_loja}:`, error);
                return res.status(500).json({ msg: "Erro interno do servidor." });
            }

            if (result.affectedRows === 0) {
                // Estoque insuficiente ou produto não encontrado
                return res.status(409).json({ msg: "Estoque insuficiente ou produto não encontrado." });
            }

            // Busca estoque atualizado
            acessa_Database_Lojas.query(
                `SELECT estoque 
                 FROM produtos
                 WHERE loja_id = ? AND codigo_produto = ?`,
                [id_da_loja, codigoProduto],
                (err2, result2) => {
                    if (err2) {
                        console.error("Erro ao buscar estoque atualizado:", err2);
                        return res.status(500).json({ msg: "Erro interno do servidor." });
                    }

                    if (result2.length === 0) {
                        return res.status(404).json({ msg: "Produto não encontrado." });
                    }

                    const estoqueAtual = result2[0].estoque;

                    // Envia sinal via socket.io
                    io.to(`loja_${id_da_loja}`).emit("estoque_atualizado", {
                        codigoProduto,
                        estoque: estoqueAtual
                    });

                    console.log(`Estoque atualizado para produto ${codigoProduto} na loja ${id_da_loja}: ${estoqueAtual}`);

                    return res.status(200).json({
                        msg: "Estoque removido com sucesso!",
                        codigoProduto,
                        estoque: estoqueAtual
                    });
                }
            );
        }
    );
});

app.post("/deletar-produto", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id; // vem do token
    const codigoProduto = req.body.codigoProduto;

    acessa_Database_Lojas.query(
        `DELETE FROM produtos WHERE loja_id = ? AND codigo_produto = ?`,
        [id_da_loja, codigoProduto],
        (error, result) => {
            if (error) {
                console.error(`Erro ao tentar deletar produto da loja ${id_da_loja}:`, error);
                return res.status(500).json({ msg: "Erro interno do servidor." });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ msg: "Produto não encontrado." });
            }

            console.log(`Produto ${codigoProduto} removido da loja ${id_da_loja}`);

            // Envia sinal via socket.io
            io.to(`loja_${id_da_loja}`).emit("produto_removido", {
                codigoProduto
            });

            return res.status(200).json({
                msg: "Produto removido com sucesso!",
                codigoProduto
            });
        }
    );
});

app.post("/alterar-valor-compra-e-venda", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const codigoProduto = req.body.codigo_produto;
    const novoValorDeCompra = req.body.novoValorDeCompra;
    const novoValorDeVenda = req.body.novoValorDeVenda;

    acessa_Database_Lojas.query(`UPDATE produtos SET preco_compra=${novoValorDeCompra}, preco_venda=${novoValorDeVenda} 
        WHERE loja_id = ? AND codigo_produto = ?`,[id_da_loja, codigoProduto], (error) =>{
        if(error){
            res.send("Erro!")
            console.log(`Erro ao tentar alterar valor de compra e venda. Erro: ${error}`)
        }else{
            res.send("Sucesso!")
        }
    })
})

//FUNCAO JÁ REESTRUTURADA. ESSA FUNÇÃO BUSCA TODOS OS PRODUTOS DE VEZ.
app.post("/busca-produtos", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id; // vem do token

    console.log(`Buscando produtos da loja: ${id_da_loja}`);

    acessa_Database_Lojas.query(
        `SELECT * FROM produtos WHERE loja_id = ?`,
        [id_da_loja],
        (error, result) => {
            if (error) {
                console.error("Erro ao buscar produtos:", error);
                return res.status(500).json({
                    msg: "Erro interno do servidor."
                });
            }

            if (result.length > 0) {
                return res.status(200).json(result);
            } else {
                return res.status(404).json({
                    msg: "Nenhum produto encontrado para esta loja."
                });
            }
        }
    );
});

//PARTE DA COMANDA
app.post("/cria-nova-comanda", autenticarToken, async (req, res) => {
    const id_da_loja = req.usuario.loja_id; // vem do token
    const identificador = req.body.novaComanda; // nome da nova comanda

    if (!identificador) {
        return res.status(400).json({
            msg: "Nome da comanda é obrigatório."
        });
    }

    acessa_Database_Lojas.getConnection((err, conn) => {
        if (err) {
            console.error("Erro conexão:", err);
            return res.status(500).json({ msg: "Erro de conexão com o banco." });
        }

        conn.beginTransaction(err => {
            if (err) {
                conn.release();
                console.error("Erro transação:", err);
                return res.status(500).json({ msg: "Erro ao iniciar transação." });
            }

            // 1️⃣ cria venda aberta
            conn.query(
                `INSERT INTO vendas (loja_id, status) VALUES (?, 'aberta')`,
                [id_da_loja],
                (erro, result) => {
                    if (erro) {
                        return conn.rollback(() => {
                            conn.release();
                            console.error("Erro ao criar venda:", erro);
                            res.status(500).json({ msg: "Erro ao criar venda." });
                        });
                    }

                    const vendaId = result.insertId;

                    // 2️⃣ cria mesa ligada à venda
                    conn.query(
                        `INSERT INTO mesas (loja_id, identificador, venda_id) VALUES (?, ?, ?)`,
                        [id_da_loja, identificador, vendaId],
                        erro => {
                            if (erro) {
                                if (erro.code === "ER_DUP_ENTRY") {
                                    return conn.rollback(() => {
                                        conn.release();
                                        res.status(409).json({
                                            msg: "Já existe uma mesa com esse nome aberta."
                                        });
                                    });
                                }

                                return conn.rollback(() => {
                                    conn.release();
                                    console.error("Erro ao criar mesa:", erro);
                                    res.status(500).json({ msg: "Erro ao criar mesa." });
                                });
                            }

                            // FINALIZA TRANSAÇÃO
                            conn.commit(err => {
                                if (err) {
                                    return conn.rollback(() => {
                                        conn.release();
                                        console.error("Erro commit:", err);
                                        res.status(500).json({ msg: "Erro ao finalizar transação." });
                                    });
                                }

                                conn.release();
                                res.status(200).json({
                                    msg: "Mesa aberta com sucesso!",
                                    venda_id: vendaId,
                                    identificador: identificador
                                });
                            });
                        }
                    );
                }
            );
        });
    });
});

/*VERSÃO ANTIGA SEM TOKEN
app.post("/cria-nova-comanda", async (req, res) => {
    const id_da_loja = req.body.id_da_loja;
    const identificador = req.body.novaComanda;

    acessa_Database_Lojas.getConnection((err, conn) => {
        if (err) {
            console.log(err);
            return res.send({ msg: 'Erro conexão' });
        }

        // INICIA TRANSAÇÃO
        conn.beginTransaction(err => {
            if (err) {
                conn.release();
                return res.send({ msg: 'Erro transação' });
            }

            // 1️⃣ cria venda aberta
            conn.query(`
                INSERT INTO vendas (loja_id, status)
                VALUES (?, 'aberta')
            `, [id_da_loja], (erro, result) => {

                if (erro) {
                    return conn.rollback(() => {
                        conn.release();
                        console.log(erro);
                        res.send({ msg: 'Erro ao criar venda' });
                    });
                }

                const vendaId = result.insertId;

                // 2️⃣ cria mesa ligada à venda
                conn.query(`
                    INSERT INTO mesas (loja_id, identificador, venda_id)
                    VALUES (?, ?, ?)
                `, [id_da_loja, identificador, vendaId], erro => {

                    if (erro) {
                        //CASO O ERRO SEJA CAUSADO POR JÁ TER UMA MESA COM O MESMO NOME.
                        if (erro.code === 'ER_DUP_ENTRY') {
                            return conn.rollback(() => {
                                conn.release();
                                res.send({ msg: 'Já existe uma mesa com esse nome aberta' });
                            });
                        }

                        return conn.rollback(() => {
                            conn.release();
                            console.log(erro);
                            res.send({ msg: 'Erro ao criar mesa' });
                        });
                    }

                    // FINALIZA TRANSAÇÃO
                    conn.commit(err => {
                        if (err) {
                            return conn.rollback(() => {
                                conn.release();
                                console.log(err);
                                res.send({ msg: 'Erro commit' });
                            });
                        }

                        conn.release();
                        res.send({
                            msg: 'Mesa aberta com sucesso!'
                        });
                    });
                });
            });
        });
    });

})*/

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
    //const novaComanda = req.body.novaComanda;

    acessa_Database_Lojas.query(`SELECT 
                                m.id,
                                m.identificador,
                                m.venda_id,
                                m.criada_em
                                FROM mesas m
                                WHERE m.loja_id = ?;
        `,[id_da_loja], (error, result) => {
        if(error){
            console.log(error)
        }else{
            if(result.length > 0){
            //AO BUSCAR COMANDAS, VOU PRECISAR ENVIAR TAMBÉM O VENDA_ID. PARA QUE O FRONT UTILIZE PARA INSERIR DADOS.
                res.send(result)
            }else{
                //console.log("Não tem nenhuma comanda aberta.")a
                res.send(false)
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

/*
    PARA QUE ESTA FUNÇÃO FUNCIONE TANTO NA TELA DE VENDAS RÁPIDA(UTILIZA O EMAIL COMO COMANDA)
    COMO NA TELA DE VENDAS POR COMANDA, VOU PRECISAR PASSAR A COMANDA COM NOME "COMANDA" INVÉS 
    DE EMAIL ASSIM VAI FUNCIONAR EM AMBAS AS TELAS.
*/
app.post("/buscar-itens-comanda", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id;
    const comanda = req.body.comanda; // identificador da comanda

    console.log(`Buscou itens da comanda. Loja: ${id_da_loja}, Comanda: ${comanda}`);

    acessa_Database_Lojas.query(
        `SELECT 
            vi.id,
            vi.produto_id,
            vi.produto_nome,
            vi.quantidade,
            vi.preco_venda,
            vi.preco_compra,
            vi.subtotal
         FROM mesas m
         JOIN vendas_itens vi ON vi.venda_id = m.venda_id
         WHERE m.loja_id = ?
         AND m.identificador = ?`,
        [id_da_loja, comanda],
        (error, result) => {
            if (error) {
                console.error("Erro ao buscar itens da comanda:", error);
                return res.status(500).json({
                    msg: "Erro interno do servidor."
                });
            }

            if (result.length > 0) {
                console.log(`Resultado da busca itens comanda: ${result[0].produto_nome}`);
                return res.status(200).json(result);
            } else {
                return res.status(404).json({
                    msg: "Nenhum resultado encontrado para esta comanda."
                });
            }
        }
    );
});


/*VERSÃO SEM TOKEN
app.post("/buscar-itens-comanda", (req,res) => {
    const id_da_loja = req.body.id_da_loja;
    const comanda = req.body.comanda;//identificador 
    console.log(`buscou itens da comanda.${id_da_loja} ${comanda}`)

    let itensNaComanda = []

    acessa_Database_Lojas.query(`SELECT 
                                vi.id,
                                vi.produto_id,
                                vi.produto_nome,
                                vi.quantidade,
                                vi.preco_venda,
                                vi.preco_compra,
                                vi.subtotal
                                FROM mesas m
                                JOIN vendas_itens vi ON vi.venda_id = m.venda_id
                                WHERE m.loja_id = ?
                                AND m.identificador = ?
        `,[id_da_loja, comanda],(error, result) => {
        if(error){
            console.log(error)
        }else{
            if(result.length > 0){//Caso tenha itens na comanda selecionada.
                console.log(`RESULTADO DA BUSCA ITENS COMANDA: ${result[0].produto_nome}`)
                res.send(result)              
            }else{
                res.send("Nenhum resultado")
            }
        }
    })
})*/
//FIM PARTE DA COMANDA

//COMANDA REFATORADA:
app.post("/Inserir-itens-comanda", (req, res) => {   
    const loja_id = req.body.loja_id; 
    const venda_id = req.body.venda_id;   
    const comanda = req.body.comanda;   
    //const lista_da_comanda = req.body.lista_da_comanda; 
    console.log(`INSERINDO ITENS NA COMANDA DA LOJA: ${loja_id}| venda_id: ${venda_id} | comanda: ${comanda}`) 
    //console.log(`venda_id: ${venda_id}`) 
    //console.log(`Itens: ${JSON.stringify(comanda)}`) //TEORICAMENTE O SERVIDOR TÁ RECEBENDO OS PRODUTOS NORMALMENTE.
    acessa_Database_Lojas.getConnection((err, conn) => {
        if (err) { 
            console.log(err);
            return res.send({ msg: 'Erro conexão' });
        }

        conn.beginTransaction(err => {
            if (err) {
                conn.release();
                return res.send({ msg: 'Erro transação' });
            }

            // 1 - Busca estado atual da venda
            conn.query(`
                SELECT produto_id, quantidade
                FROM vendas_itens
                WHERE venda_id = ?
            `, [venda_id], (erro, antigos) => {

                if (erro) {
                    return conn.rollback(() => {
                        conn.release();
                        console.log(erro);
                        res.send({ msg: 'Erro buscar itens antigos' });
                    });
                }

                
                const antigosMap = {};
                antigos.forEach(i => antigosMap[i.produto_id] = i.quantidade);

                const novosIds = comanda.map(p => p.produto_id);

                let processados = 0;

                const finalizar = () => {
                    conn.commit(err => {
                        if (err) {
                            return conn.rollback(() => {
                                conn.release();
                                console.log(err);
                                res.send({ msg: 'Erro commit' });
                            });
                        }
                        conn.release();
                        res.send({ msg: 'Comanda atualizada com sucesso' });
                    });
                };

                if (comanda.length === 0) {

                    // Remove tudo se esvaziou a mesa
                    conn.query(`
                        DELETE FROM vendas_itens WHERE venda_id = ?
                    `, [venda_id], erro => {

                        if (erro) {
                            return conn.rollback(() => {
                                conn.release();
                                console.log(erro);
                                res.send({ msg: 'Erro limpar comanda' });
                            });
                        }

                        return finalizar();
                    });

                    return;
                }

                // 2️⃣ Insere ou atualiza cada item
                comanda.forEach(prod => {
                    const qtdAntiga = antigosMap[prod.produto_id] || 0;
                    const delta = prod.quantidade - qtdAntiga;

                    const subtotal = prod.quantidade * prod.preco_venda;
                    conn.query(`
                        INSERT INTO vendas_itens
                        (venda_id, produto_id, produto_nome, quantidade, preco_venda, preco_compra, subtotal)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            quantidade = VALUES(quantidade),
                            subtotal = VALUES(subtotal)
                    `, [
                        venda_id,
                        prod.produto_id,
                        prod.produto_nome,
                        prod.quantidade,
                        prod.preco_venda,
                        prod.preco_compra,
                        subtotal 
                    ], erro => {

                        if (erro) {
                            return conn.rollback(() => {
                                conn.release();
                                console.log(erro);
                                res.send({ msg: 'Erro salvar item' });
                            });
                        }

                        // 3️⃣ Ajusta estoque pelo delta
                        if (delta !== 0) {
                            conn.query(`
                                UPDATE produtos
                                SET estoque = estoque - ?
                                WHERE loja_id = ?
                                AND codigo_produto = ?
                            `, [delta, loja_id, prod.produto_id], erro => {

                                if (erro) {
                                    return conn.rollback(() => {
                                        conn.release();
                                        console.log(erro);
                                        res.send({ msg: 'Erro atualizar estoque' });
                                    });
                                }

                                checarFinalizacao();
                            });

                        } else {
                            checarFinalizacao();
                        }
                    });
                });
                
                // Remove produtos que saíram da comanda
                antigos.forEach(old => {
                    if (!novosIds.includes(old.produto_id)) {

                        conn.query(`
                            DELETE FROM vendas_itens
                            WHERE venda_id = ?
                            AND produto_id = ?
                        `, [venda_id, old.produto_id], erro => {

                            if (erro) {
                                return conn.rollback(() => {
                                    conn.release();
                                    console.log(erro);
                                    res.send({ msg: 'Erro remover item' });
                                });
                            }

                            // devolve estoque
                            conn.query(`
                                UPDATE produtos
                                SET estoque = estoque + ?
                                WHERE loja_id = ?
                                AND codigo_produto = ?
                            `, [old.quantidade, loja_id, old.produto_id], erro => {

                                if (erro) {
                                    return conn.rollback(() => {
                                        conn.release();
                                        console.log(erro);
                                        res.send({ msg: 'Erro devolver estoque' });
                                    });
                                }

                                checarFinalizacao();
                            });
                        });
                    }
                });
                
                function checarFinalizacao() {
                    processados++;
                    const totalEsperado = comanda.length + antigos.filter(a => !novosIds.includes(a.produto_id)).length;
                    if (processados === totalEsperado) {
                        finalizar();
                    }
                }
                
            });

        });
    });
});

/*FUNCAO UTILIZADA NO MOBILE AO ABRIR A TELA DE VENDAS RÁPIDA. */
app.post("/verifica-comanda-aberta", (req, res) => {

    const id_da_loja = req.body.id_da_loja;
    const comanda = req.body.comanda;//identificador 
    console.log(`buscou itens da comanda.${id_da_loja} ${comanda}`)

    let itensNaComanda = []

    acessa_Database_Lojas.query(`SELECT 
                                vi.id,
                                vi.produto_id,
                                vi.produto_nome,
                                vi.quantidade,
                                vi.preco_venda,
                                vi.preco_compra,
                                vi.subtotal
                                FROM mesas m
                                JOIN vendas_itens vi ON vi.venda_id = m.venda_id
                                WHERE m.loja_id = ?
                                AND m.identificador = ?
        `,[id_da_loja, comanda],(error, result) => {
        if(error){
            console.log(error)
        }else{
            if(result.length > 0){//Caso tenha itens na comanda selecionada.
                console.log(`RESULTADO DA BUSCA ITENS COMANDA: ${result[0].produto_nome}`)
                res.send(result)              
            }else{
                res.send("Nenhum resultado")
            }
        }
    })
})

//FIM COMANDA REFATORADA

//FUNCOES INICIALMENTE USADAS APENAS NA VERSÃO DESKTOP.
/*
    FUNÇÃO USADA APENAS NO GIVLASI CONTROLE DESKTOP
    TENHO UMA FUNCAO CHAMADA codigo_produto() QUE R-
    ETORNA O CÓDIGO DO PRODUTO. (AO BUSCAR UM PRODU-
    TO PELO NOME O APP TAMBÉM PRECISA DO CÓDIGO DELE).
*/
app.post("/pega-codigo-produto", autenticarToken, (req, res) => {

    const loja_id = req.usuario.loja_id;
    const nome_Do_Produto = req.body.nome_Do_Produto;

    // console.log(`PEGOU O CODIGO DO PRODUTO PELO NOME. ${loja_id} & ${nome_Do_Produto}`);

    acessa_Database_Lojas.query(
        `SELECT * FROM produtos WHERE loja_id = ? AND nome = ?`,
        [loja_id, nome_Do_Produto],
        (error, result) => {

            // Erro no banco
            if (error) {

                console.error(
                    "Erro ao buscar código do produto:",
                    error
                );

                return res.status(500).json({
                    msg: "Erro interno do servidor."
                });
            }

            // Nenhum produto encontrado
            if (result.length === 0) {

                return res.status(404).json({
                    msg: "Nenhum produto encontrado com esse nome."
                });
            }

            // Produto encontrado
            console.log(
                `RESULTADO DO PEGO-CODIGO-PRODUTO: ${JSON.stringify(result)}`
            );

            return res.status(200).json({
                msg: result
            });
        }
    );
});
/*FUNCAO ANTIGA SEM AUTENTICAÇÃO
app.post("/pega-codigo-produto", (req,res) => {
    const loja_id = req.body.loja_id;
    const nome_Do_Produto = req.body.nome_Do_Produto;
    //console.log(`PEGOU O CODIGO DO PRODUTO PELO NOME. ${loja_id} & ${nome_Do_Produto}`)

    acessa_Database_Lojas.query(`SELECT * FROM produtos WHERE loja_id = ? AND nome = ?`, [loja_id, nome_Do_Produto] ,(error, result) => {
        if(error){
            console.log(`Erro: ${error}`)
            res.send({msg:"Erro"})
        }if(result.length > 0){
            // AQUI RETORNO O CÓDIGO DO PRODUTO QUE FOI SELECIONADO PELO NOME.
            console.log(`RESULTADO DO PEGO-CODIGO-PRODUTO: ${result}`)
            res.send({msg:result})
        }else{
            res.send({msg:"Erro"})//NENHUM PRODUTO ENCONTRADO COM ESSE NOME.
        }
        console.log(result)
    })
});*/

//FUNÇÃO USADA PARA A TELA DE VENDAS RÁPIDA.
/*NA TELA DE VENDAS POR COMANDA, O SERVIDOR JÁ ENVIA O venda_id PARA O FRONT,
  MAS PARA A TELA DE VENDAS RÁPIDA PRECISEI ADAPTAR ALGO.
*/
app.post("/pega-venda-id", autenticarToken, (req, res) => {
    const id_da_loja = req.usuario.loja_id;
    const comanda = req.usuario.email; // identificador da comanda vem do token

    acessa_Database_Lojas.query(
        `SELECT m.venda_id
         FROM mesas m
         WHERE m.loja_id = ?
         AND m.identificador = ?`,
        [id_da_loja, comanda],
        (error, result) => {
            if (error) {
                console.error("Erro ao buscar venda_id:", error);
                return res.status(500).json({
                    msg: "Erro interno do servidor."
                });
            }

            if (result.length > 0) {
                console.log(`Pegou venda_id: ${result[0].venda_id}`);
                return res.status(200).json({
                    venda_id: result[0].venda_id
                });
            } else {
                return res.status(404).json({
                    msg: "Nenhum venda_id encontrado."
                });
            }
        }
    );
});

/* VERSÃO ANTIGA
app.post("/pega-venda-id", (req,res) => { 
    const loja_id = req.body.loja_id; 
    const comanda = req.body.comanda; 
    console.log(`PEGOU O VENDA_ID. ${loja_id} & ${comanda}`)   
    
    acessa_Database_Lojas.query(`SELECT venda_id FROM mesas WHERE loja_id = ? AND identificador = ?`, [loja_id, comanda] ,(error, result) => {
        if(error){  
            console.log(`Erro: ${error}`)
            res.send({msg: "Erro"})
        }if(result.length > 0){ 
            // AQUI RETORNO O venda_id DA COMANDA ABERTA.
            console.log(`RESULTADO DO PEGA-VENDA-ID: ${result[0].venda_id}`)  
            const venda_id = result[0].venda_id;
            res.send({msg: venda_id})
        }else{
            res.send({msg: "Erro"})//NENHUMA COMANDA ENCONTRADA COM ESSE NOME.
        }
    })
})*/

//FIM DAS FUNCOES INICIALMENTE USADAS APENAS NA VERSÃO DESKTOP.

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

    acessa_Database_Lojas.query(`SELECT data_de_vencimento FROM status_planos WHERE id_da_loja=${id_da_loja}`, (erro,result) =>{
        if(erro){
            console.log(`Erro na função somaDataMensalidade: ${erro}`)
        }else{
            if(resultadoDaMensalidade(result[0].data_de_vencimento)){//Se venceu é false, senão, verdadeira
                const date1 = new Date(result[0].data_de_vencimento);
                date1.setDate(date1.getDate() + novaData)
                const dataFuturaTratada = (date1.toISOString().split('T')[0])

                acessa_Database_Lojas.query(`UPDATE status_planos SET metodo_de_pagamento='pix', status='ativo', descricao_do_plano='${novaData} dias', data_de_vencimento='${dataFuturaTratada}' WHERE id_da_loja=${id_da_loja}`, (error) => {
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
                acessa_Database_Lojas.query(`UPDATE status_planos SET metodo_de_pagamento='pix', status='ativo', data_de_vencimento='${dataFuturaTratada}' WHERE id_da_loja=${id_da_loja}`, (error) => {
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
    acessa_Database_Lojas.query(`SELECT * FROM status_planos WHERE id_da_loja=${id_da_loja}`, (error, result) => {
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
    acessa_Database_Lojas.query(`SELECT status FROM status_planos WHERE id_da_loja=${id_da_loja}`, (erro,result) =>{
        if(erro){
            console.log("Erro ao verificar status da loja para desbloqueio-de-confiança: " + erro)
            res.send("Error!")
        }else{
            if(result[0].status != "pendente"){
                acessa_Database_Lojas.query(`UPDATE status_planos SET status='pendente', data_de_vencimento='${dataFuturaTratada}' where id_da_loja=${id_da_loja};`, (error) => {
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

    acessa_Database_Lojas.query(`SELECT data_de_vencimento FROM status_planos WHERE id_da_loja=${id_da_loja}`, (erro,result) =>{
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


server.listen(port, () => {
    console.log(`Servidor iniciado na porta: ${port}`)
});
