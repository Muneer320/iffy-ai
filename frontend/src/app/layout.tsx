import type { Metadata } from 'next';
import './notebook.css';
export const metadata:Metadata={title:'iffy.ai — The consequence notebook',description:'Pull on one idea. Explore the people, systems and trade-offs on the other side of what if.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
