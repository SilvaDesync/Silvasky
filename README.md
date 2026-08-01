# Error Collector Desktop & Screen Recorder

Aplicativo Desktop Portátil em Electron para Coleta Unificada de Erros e Gravação de Tela/Microfone.

## 🚀 Funcionalidades Integradas
1. **Gravação de Tela & Microfone**: Grava a tela inteira do computador (navegador + apps externos) com áudio do microfone opcional.
2. **Persistência Multitelas / Multidomínios**: Alterne do `site.com` para o `multipedidos2.com` mantendo todo o histórico de erros intacto no mesmo relatório.
3. **Coleta Automática do Console & Rede**: Intercepta erros JavaScript (Warnings/Errors) e falhas HTTP (4xx/5xx).
4. **Inspeção do Gestor Multipedidos (App Externo)**: Conecta-se via Chrome DevTools Protocol (CDP) na porta de debug (ex: 9222) para ouvir o console de apps desktop.

---

## 🛠️ Como Testar em Modo Desenvolvedor

1. Instale o Node.js em seu computador.
2. Abra o terminal nesta pasta e execute:
   ```bash
   npm install
   npm start
   ```

---

## 📦 Como Gerar o Arquivo Executável Portátil (`.exe`)

Para gerar o arquivo executável que funciona em qualquer computador sem precisar instalar nada:

1. No terminal, execute:
   ```bash
   npm run build
   ```
2. Após o término, uma pasta chamada `dist/` será criada contendo o executável **`ErrorCollectorDesktop-1.0.0-portable.exe`**.

---

## 🔌 Como Conectar ao App do Gestor Multipedidos

1. Inicie o aplicativo do Gestor Multipedidos com a flag de depuração ativada no atalho do Windows:
   `GestorMultipedidos.exe --remote-debugging-port=9222`
2. No Error Collector Desktop, digite `9222` no campo de porta do App Externo e clique em **"Conectar Console"**.
3. Todos os erros e `console.log` gerados dentro do Gestor passarão a aparecer no relatório unificado em tempo real.
