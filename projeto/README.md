# Advanced Company — Sistema v3.0

Backend real (Node.js + Express + PostgreSQL) para o sistema de cadastros e
permissões. Os dados ficam salvos no banco — qualquer pessoa que acessar o
link vê os mesmos registros, em tempo real, sem depender do navegador de cada
um.

## O que mudou em relação à versão anterior (só HTML)

- Login agora é validado no servidor, com senha protegida (hash bcrypt) e
  sessão por token (JWT) — antes era tudo no navegador.
- Usuários, fichas de pessoas e fotos ficam salvos no PostgreSQL, não mais no
  `localStorage` de cada navegador.
- Dá pra adicionar/trocar/remover a foto 3x4 de uma pessoa direto na tela de
  edição da ficha (clique em "Editar" → "Adicionar Foto").
- Cada pessoa também pode ter uma **foto de passaporte reservada**: ela não
  aparece em nenhuma tela do sistema (nem na lista, nem na ficha), só é
  gerenciada dentro do modo de edição e só é exibida quando alguém exporta o
  PDF daquele registro — nesse caso, vira uma página extra (anexo) no
  documento.
- Botão **"Nova Pessoa"** na tela de Registros para criar um registro do
  zero (com ou sem foto), e botão **"Remover"** dentro da ficha para apagar
  um registro permanentemente. Os dois são exclusivos do nível `dev`.
- Permissões alteradas pelo `dev` valem na hora para a próxima ação da
  pessoa, mesmo sem ela deslogar.

## Estrutura do projeto

```
.
├── server.js        # ponto de entrada — rotas da API
├── auth.js          # login (JWT) e proteção das rotas
├── db.js            # conexão com o Postgres, criação das tabelas e dados iniciais
├── package.json
├── .env.example      # referência das variáveis de ambiente
└── public/
    └── index.html    # todo o front-end (visual + lógica de tela)
```

## Subindo no Railway (recomendado, é o mais direto)

1. Crie um repositório no GitHub com esses arquivos e suba (`git init`,
   `git add .`, `git commit -m "sistema"`, `git push`).
2. Em [railway.app](https://railway.app), clique em **New Project → Deploy
   from GitHub repo** e escolha o repositório.
3. Dentro do projeto, clique em **+ New → Database → Add PostgreSQL**.
   O Railway já injeta a variável `DATABASE_URL` automaticamente no seu
   serviço — não precisa copiar/colar nada.
4. No serviço da aplicação (não no banco), vá em **Variables** e adicione:
   - `JWT_SECRET` → uma string aleatória grande (pode gerar com
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
     no seu computador e colar o resultado).
5. O Railway detecta automaticamente que é um projeto Node (por causa do
   `package.json`) e roda `npm install` + `npm start` sozinho.
6. Quando o deploy terminar, clique em **Settings → Networking → Generate
   Domain** para gerar o link público (`algumacoisa.up.railway.app`).
7. Acesse o link — na primeira vez que o servidor sobe, ele cria as tabelas
   e popula com os 3 usuários e as 50 pessoas de exemplo automaticamente.

No Render o processo é equivalente: criar um **Web Service** a partir do
repositório, adicionar um banco **PostgreSQL** (Render também injeta a
`DATABASE_URL` se você ligar o banco ao serviço), e definir `JWT_SECRET` nas
variáveis de ambiente do serviço.

## Rodando localmente (para testar antes de subir)

Pré-requisitos: Node.js 18+ e um PostgreSQL (local ou um banco de teste na
nuvem).

```bash
npm install
cp .env.example .env
# edite o .env com a DATABASE_URL do seu Postgres e um JWT_SECRET qualquer
npm start
```

Acesse `http://localhost:3000`.

## Credenciais padrão (de fábrica)

| Login   | Senha    | Nível |
|---------|----------|-------|
| dev     | dev123   | dev   |
| admin   | admin123 | admin |
| usuario | user123  | user  |

**Troque essas senhas assim que possível** (Usuários → Editar), já que o
sistema vai ficar publicamente acessível pela internet.

## Restaurar dados de fábrica

Na aba **Usuários** (só aparece pra quem está logado como `dev`), o botão
**Restaurar Padrão** apaga tudo no banco e recria os 3 usuários e as 50
pessoas de exemplo — útil se quiser zerar os testes antes de usar o sistema
de verdade.

## Limitações conhecidas (vale saber)

- As fotos são guardadas como texto (base64) dentro do próprio banco, sem
  serviço externo de armazenamento. Funciona bem para o volume que você
  descreveu (poucas pessoas, uso interno), mas se um dia o banco de
  registros crescer muito (milhares de fotos), vale migrar para um serviço
  de armazenamento de arquivos (ex: S3/Cloudflare R2).
- Não tem limite de tentativas de login (rate limiting). Para uma ferramenta
  interna de até 5 pessoas isso normalmente não é problema, mas se o link
  for ficar exposto publicamente por muito tempo, é uma melhoria a considerar
  depois.
