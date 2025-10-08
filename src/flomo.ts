export class FlomoClient {
    private readonly apiUrl: string;

    constructor({apiUrl}: {apiUrl: string}) {
        this.apiUrl = apiUrl;
    }

    async writeNote({content}: {content: string}) {
        try {
            if (!content) {
                throw new Error("Invalid content");
            }

            const req = {
                content,
            }

            const resp = await fetch(this.apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(req),
            });

            if (!resp.ok) {
                throw new Error(`Failed to write note: ${resp.statusText}`);
            }

            return resp.json();
        } catch (e) {
            throw e;
        }
    }
}