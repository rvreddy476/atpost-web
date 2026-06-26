import { cn } from "./cn"

function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("rounded-2xl bg-brand-card/80 backdrop-blur-sm border border-brand-text/10 shadow-sm", className)} {...props}>
            {children}
        </div>
    )
}

function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("px-6 pt-6 pb-2", className)} {...props}>
            {children}
        </div>
    )
}

function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3 className={cn("font-semibold text-brand-text", className)} {...props}>
            {children}
        </h3>
    )
}

function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("px-6 pb-6", className)} {...props}>
            {children}
        </div>
    )
}

export { Card, CardHeader, CardTitle, CardContent }
