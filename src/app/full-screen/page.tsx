import { PagesPanel } from "@/app/pages-panel/PagesPanel";
import {
  Card, CardContent, CardHeader, CardTitle
} from "@/components/ui/card";

export default function FullScreen() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>JIRA Reporter</CardTitle>
        </CardHeader>
        <CardContent>
          <PagesPanel />
        </CardContent>
      </Card>
    </div>
  );
}
