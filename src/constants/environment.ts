export enum Environment {
    Local = "local",
    Dev = "dev",
    Prod = "prod"
}

export function makeEnvironment(env: string): Environment {
    if (env === "dev") return Environment.Dev
    if (env === "prod") return Environment.Prod
    return Environment.Local
}