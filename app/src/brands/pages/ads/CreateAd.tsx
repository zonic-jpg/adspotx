import React, { useState } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateBrandAd } from "@workspace/api-client-react";
import { CreateAdRequestAssetType, CreateQuestionRequestQuestionType } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardFooter } from "@brands/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@brands/components/ui/form";
import { Input } from "@brands/components/ui/input";
import { Button } from "@brands/components/ui/button";
import { Textarea } from "@brands/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@brands/components/ui/select";
import { Progress } from "@brands/components/ui/progress";
import { useToast } from "@brands/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Upload, Link, X } from "lucide-react";
import { normalizeAssetPayload } from "../../../lib/adAssetNormalize";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const questionSchema = z.object({
  questionType: z.enum(["multiple_choice", "rating", "open_text", "emoji", "yes_no"]),
  questionText: z.string().min(1, "Question text is required"),
  options: z.array(z.string()).optional(),
});

const createAdSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  assetUrl: z.string().url("Must be a valid URL"),
  assetType: z.enum(["image", "video"]),
  minWatchSeconds: z.coerce.number().min(1).default(15),
  pointReward: z.coerce.number().min(1).default(10),
  proverbQuestion: z.string().optional(),
  proverbAnswer: z.string().optional(),
  proverbBonusPoints: z.coerce.number().min(0).max(100).default(5),
  questions: z.array(questionSchema).max(10, "Maximum 10 questions allowed").default([]),
});

type CreateAdFormValues = z.infer<typeof createAdSchema>;

export default function CreateAd() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateBrandAd();
  const [assetInputMode, setAssetInputMode] = useState<"url" | "upload">("url");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const form = useForm<CreateAdFormValues>({
    resolver: zodResolver(createAdSchema),
    defaultValues: {
      title: "",
      description: "",
      assetUrl: "",
      assetType: "video",
      minWatchSeconds: 15,
      pointReward: 10,
      proverbQuestion: "",
      proverbAnswer: "",
      proverbBonusPoints: 5,
      questions: [],
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "questions",
  });

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: "/api/storage",
    getAuthToken: () => localStorage.getItem("adspot_brand_token"),
    onSuccess: (response: { objectPath: string }) => {
      const objectUrl = `${window.location.origin}/api/storage${response.objectPath}`;
      form.setValue("assetUrl", objectUrl, { shouldValidate: true });
      toast({ title: "Upload complete", description: "Your file has been uploaded successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Maximum file size is 100 MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast({ title: "Unsupported file type", description: "Please upload an image or video file.", variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (isImage && form.getValues("assetType") === "video") {
      form.setValue("assetType", "image");
    } else if (isVideo && form.getValues("assetType") === "image") {
      form.setValue("assetType", "video");
    }

    setUploadedFileName(file.name);
    form.setValue("assetUrl", "", { shouldValidate: false });
    await uploadFile(file);
  };

  const clearUpload = () => {
    setUploadedFileName(null);
    form.setValue("assetUrl", "", { shouldValidate: false });
  };

  const onSubmit = (values: CreateAdFormValues) => {
    const formattedQuestions = values.questions.map(q => ({
      questionType: q.questionType as CreateQuestionRequestQuestionType,
      questionText: q.questionText,
      ...(q.questionType === "multiple_choice" && q.options && q.options.filter(o => o.trim() !== "").length > 0
        ? { options: q.options.filter(o => o.trim() !== "") }
        : {}),
    }));

    const normalizedAsset = normalizeAssetPayload(values.assetUrl, values.assetType);

    const payload = {
      ...values,
      assetUrl: normalizedAsset.assetUrl,
      assetType: normalizedAsset.assetType as CreateAdRequestAssetType,
      proverbQuestion: values.proverbQuestion?.trim() || undefined,
      proverbAnswer: values.proverbAnswer?.trim() || undefined,
      proverbBonusPoints: values.proverbBonusPoints,
      questions: formattedQuestions.length > 0 ? formattedQuestions : undefined,
    };

    createMutation.mutate(
      { data: payload },
      {
        onSuccess: (data) => {
          toast({ title: "Ad Created", description: "Your ad has been successfully created." });
          setLocation(`/ads/${data.id}`);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Could not create ad. Please try again.",
            variant: "destructive"
          });
        }
      }
    );
  };

  const nextStep = async () => {
    let valid = false;
    if (step === 1) {
      valid = await form.trigger(["title", "assetUrl", "assetType", "minWatchSeconds", "pointReward"]);
    } else if (step === 2) {
      valid = await form.trigger(["questions"]);
    }
    if (valid) setStep(s => s + 1);
  };

  const prevStep = () => setStep(s => Math.max(1, s - 1));

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create Campaign</h1>
        <div className="flex items-center gap-2 mt-4 text-sm font-medium">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${step >= 1 ? 'border-primary bg-primary/10' : 'border-muted-foreground'}`}>1</div>
            <span>Details</span>
          </div>
          <div className="w-8 h-px bg-border"></div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${step >= 2 ? 'border-primary bg-primary/10' : 'border-muted-foreground'}`}>2</div>
            <span>Questions</span>
          </div>
          <div className="w-8 h-px bg-border"></div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${step >= 3 ? 'border-primary bg-primary/10' : 'border-muted-foreground'}`}>3</div>
            <span>Review</span>
          </div>
        </div>
      </div>

      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="pt-6">
              {step === 1 && (
                <div className="space-y-6">
                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Title</FormLabel>
                      <FormControl><Input {...field} data-testid="ad-title-input" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl><Textarea {...field} data-testid="ad-desc-input" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Ad Asset</span>
                      <div className="flex rounded-md border overflow-hidden ml-auto">
                        <button
                          type="button"
                          onClick={() => { setAssetInputMode("upload"); clearUpload(); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${assetInputMode === "upload" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                        >
                          <Upload className="h-3 w-3" /> Upload File
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAssetInputMode("url"); clearUpload(); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${assetInputMode === "url" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                        >
                          <Link className="h-3 w-3" /> Paste URL
                        </button>
                      </div>
                    </div>

                    {assetInputMode === "upload" ? (
                      <div className="space-y-3">
                        {uploadedFileName && !isUploading ? (
                          <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/40">
                            <Upload className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-sm truncate flex-1">{uploadedFileName}</span>
                            <button
                              type="button"
                              onClick={clearUpload}
                              className="text-muted-foreground hover:text-foreground shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md p-8 cursor-pointer transition-colors ${isUploading ? "opacity-60 pointer-events-none border-primary/40 bg-primary/5" : "hover:border-primary/50 hover:bg-muted/30"}`}>
                            <Upload className="h-6 w-6 text-muted-foreground" />
                            <div className="text-center">
                              <p className="text-sm font-medium">Click to upload or drag and drop</p>
                              <p className="text-xs text-muted-foreground mt-1">Images and videos up to 100 MB</p>
                            </div>
                            <input
                              type="file"
                              accept="image/*,video/*"
                              className="sr-only"
                              disabled={isUploading}
                              onChange={handleFileChange}
                            />
                          </label>
                        )}

                        {isUploading && (
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Uploading {uploadedFileName}…</span>
                              <span>{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                          </div>
                        )}

                        <FormField control={form.control} name="assetUrl" render={() => (
                          <FormItem className="hidden">
                            <FormControl><Input type="hidden" {...form.register("assetUrl")} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        {form.formState.errors.assetUrl && (
                          <p className="text-sm text-destructive">{form.formState.errors.assetUrl.message}</p>
                        )}
                      </div>
                    ) : (
                      <FormField control={form.control} name="assetUrl" render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="https://..." {...field} data-testid="ad-url-input" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField control={form.control} name="assetType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asset Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="video">Video</SelectItem>
                            <SelectItem value="image">Image</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="minWatchSeconds" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min Watch Time (Seconds)</FormLabel>
                        <FormControl><Input type="number" {...field} data-testid="ad-watch-input" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="pointReward" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reward Points</FormLabel>
                        <FormControl><Input type="number" {...field} data-testid="ad-points-input" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <Card className="p-4 border border-amber-300 bg-amber-50/60">
                    <div className="mb-3">
                      <h3 className="font-semibold text-amber-900">Proverb bonus question</h3>
                      <p className="text-sm text-amber-800/80">An attention check. Reviewers who answer your proverb correctly earn bonus points — this filters out bots and skimmers and proves genuine attention.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="proverbQuestion" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Proverb / question</FormLabel>
                          <FormControl><Input placeholder='e.g. "A roaring lion kills no…?"' {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="proverbAnswer" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your preferred answer</FormLabel>
                          <FormControl><Input placeholder='e.g. "game"' {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="proverbBonusPoints" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bonus points</FormLabel>
                          <FormControl><Input type="number" min={0} max={100} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </Card>

                  {fields.map((field, index) => (
                    <Card key={field.id} className="p-4 border border-border bg-card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1 mt-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => move(index, Math.max(0, index - 1))} disabled={index === 0} className="h-6 w-6">
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => move(index, Math.min(fields.length - 1, index + 1))} disabled={index === fields.length - 1} className="h-6 w-6">
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex-1 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField control={form.control} name={`questions.${index}.questionType`} render={({ field: qField }) => (
                              <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select onValueChange={qField.onChange} defaultValue={qField.value}>
                                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                                    <SelectItem value="rating">Rating</SelectItem>
                                    <SelectItem value="open_text">Open Text</SelectItem>
                                    <SelectItem value="emoji">Reaction</SelectItem>
                                    <SelectItem value="yes_no">Yes/No</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                            <div className="col-span-2">
                              <FormField control={form.control} name={`questions.${index}.questionText`} render={({ field: qField }) => (
                                <FormItem>
                                  <FormLabel>Question</FormLabel>
                                  <FormControl><Input {...qField} data-testid={`q-text-${index}`} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                            </div>
                          </div>

                          {form.watch(`questions.${index}.questionType`) === "multiple_choice" && (
                            <div className="space-y-2">
                              <FormLabel>Options (comma separated)</FormLabel>
                              <Input
                                placeholder="Option 1, Option 2, Option 3"
                                value={form.watch(`questions.${index}.options`)?.join(", ") || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  form.setValue(`questions.${index}.options`, val ? val.split(",").map(s => s.trim()) : []);
                                }}
                              />
                            </div>
                          )}
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}

                  {fields.length < 10 && (
                    <Button type="button" variant="outline" className="w-full border-dashed py-8" onClick={() => append({ questionType: "rating", questionText: "", options: [] })}>
                      <Plus className="mr-2 h-4 w-4" /> Add Question
                    </Button>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-md bg-muted/50 border">
                    <div><span className="text-sm text-muted-foreground">Title</span><p className="font-medium">{form.watch("title")}</p></div>
                    <div><span className="text-sm text-muted-foreground">Reward</span><p className="font-medium">{form.watch("pointReward")} pts</p></div>
                    <div className="col-span-2"><span className="text-sm text-muted-foreground">Asset</span><p className="font-medium truncate">{uploadedFileName ? `Uploaded: ${uploadedFileName}` : form.watch("assetUrl")}</p></div>
                    <div><span className="text-sm text-muted-foreground">Type</span><p className="font-medium capitalize">{form.watch("assetType")}</p></div>
                    <div><span className="text-sm text-muted-foreground">Min Watch</span><p className="font-medium">{form.watch("minWatchSeconds")}s</p></div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Questions ({fields.length})</h3>
                    {fields.length > 0 ? (
                      <div className="space-y-3">
                        {form.watch("questions").map((q, i) => (
                          <div key={i} className="text-sm border-l-2 border-primary pl-3 py-1">
                            <div className="font-medium">{i + 1}. {q.questionText}</div>
                            <div className="text-muted-foreground capitalize text-xs mt-1">{q.questionType.replace("_", " ")}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No questions added. Viewers will only watch the ad.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex justify-between border-t p-6">
              <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1 || createMutation.isPending}>
                <ChevronLeft className="w-4 h-4 mr-2" /> Back
              </Button>

              {step < 3 ? (
                <Button type="button" onClick={nextStep} disabled={isUploading}>
                  {isUploading ? "Uploading…" : "Next"} {!isUploading && <ChevronRight className="w-4 h-4 ml-2" />}
                </Button>
              ) : (
                <Button type="submit" disabled={createMutation.isPending} data-testid="btn-submit-ad">
                  {createMutation.isPending ? "Submitting..." : "Launch Campaign"}
                </Button>
              )}
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
