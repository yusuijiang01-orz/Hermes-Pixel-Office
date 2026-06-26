# Hermes Pixel Office

Local pixel office driven by the real Hermes Kanban state.

- This computer: `http://127.0.0.1:8777`
- Phone on the same Wi-Fi: `http://<computer-lan-ip>:8777`
- Start: run `start-office.ps1`
- Messages create high-priority Kanban tasks for the selected profile.
- The page refreshes real task and reply state every five seconds.

The office server listens on the local network. Do not expose port 8777 to the public internet.
