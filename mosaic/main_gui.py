import cv2
import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageTk
import argparse
from pathlib import Path

# 既存のモジュールから必要な関数をインポート
import sys
sys.path.append(os.path.dirname(__file__))
from main import (
    detect_faces,
    detect_text_regions,
    mosaic_region,
    strip_exif_and_save,
    list_images_recursively,
    FACE_CASCADE_PATH,
    OUTPUT_DIRNAME,
    MOSAIC_RATIO,
    USE_OCR,
    IMAGE_EXTS,
)


class MosaicEditorApp:
    def __init__(self, root, image_paths, output_root, root_dir):
        self.root = root
        self.root.title("モザイク処理エディタ")

        self.image_paths = image_paths
        self.current_index = 0
        self.output_root = output_root
        self.root_dir = root_dir

        self.original_img = None
        self.display_img = None
        self.photo = None

        # 検出された領域
        self.rectangles = []  # [(x, y, w, h, type, label), ...]
        # type: 'face', 'text', 'date', 'manual'

        # 描画中の矩形
        self.drawing = False
        self.start_x = 0
        self.start_y = 0
        self.current_rect = None

        # 選択中の矩形
        self.selected_rect = None
        self.dragging = False
        self.drag_start_x = 0
        self.drag_start_y = 0

        # リサイズ中の矩形
        self.resizing = False
        self.resize_handle = None  # 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
        self.resize_start_rect = None

        # 表示倍率
        self.scale = 1.0
        self.max_display_width = 1200
        self.max_display_height = 800

        # OCRリーダー
        self.ocr_reader = None
        self.face_cascade = None

        self.setup_ui()
        self.load_detectors()

        if self.image_paths:
            self.load_image(0)

    def setup_ui(self):
        """UIのセットアップ"""
        # メインフレーム
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # 左側：画像表示エリア
        left_frame = ttk.Frame(main_frame)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # キャンバス
        self.canvas = tk.Canvas(left_frame, bg='gray', cursor='cross')
        self.canvas.pack(fill=tk.BOTH, expand=True)

        # マウスイベント
        self.canvas.bind('<ButtonPress-1>', self.on_mouse_down)
        self.canvas.bind('<B1-Motion>', self.on_mouse_move)
        self.canvas.bind('<ButtonRelease-1>', self.on_mouse_up)
        self.canvas.bind('<ButtonPress-3>', self.on_right_click)
        self.canvas.bind('<Motion>', self.on_mouse_motion)

        # 右側：コントロールパネル
        right_frame = ttk.Frame(main_frame, width=300)
        right_frame.pack(side=tk.RIGHT, fill=tk.Y, padx=(10, 0))
        right_frame.pack_propagate(False)

        # ファイル情報
        info_frame = ttk.LabelFrame(right_frame, text="ファイル情報")
        info_frame.pack(fill=tk.X, pady=(0, 10))

        self.file_label = ttk.Label(info_frame, text="", wraplength=280)
        self.file_label.pack(padx=5, pady=5)

        self.progress_label = ttk.Label(info_frame, text="")
        self.progress_label.pack(padx=5, pady=5)

        # 検出領域リスト
        list_frame = ttk.LabelFrame(right_frame, text="検出領域")
        list_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # スクロールバー付きリストボックス
        list_scroll = ttk.Scrollbar(list_frame)
        list_scroll.pack(side=tk.RIGHT, fill=tk.Y)

        self.rect_listbox = tk.Listbox(list_frame, yscrollcommand=list_scroll.set)
        self.rect_listbox.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        list_scroll.config(command=self.rect_listbox.yview)

        self.rect_listbox.bind('<<ListboxSelect>>', self.on_select_rect)

        # 操作ボタン
        button_frame = ttk.Frame(right_frame)
        button_frame.pack(fill=tk.X)

        ttk.Button(button_frame, text="自動検出", command=self.auto_detect).pack(fill=tk.X, pady=2)
        ttk.Button(button_frame, text="選択を削除", command=self.delete_selected).pack(fill=tk.X, pady=2)
        ttk.Button(button_frame, text="全て削除", command=self.clear_all).pack(fill=tk.X, pady=2)

        ttk.Separator(right_frame, orient='horizontal').pack(fill=tk.X, pady=10)

        # ナビゲーションボタン
        nav_frame = ttk.Frame(right_frame)
        nav_frame.pack(fill=tk.X)

        ttk.Button(nav_frame, text="← 前へ", command=self.prev_image).pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)
        ttk.Button(nav_frame, text="次へ →", command=self.next_image).pack(side=tk.RIGHT, expand=True, fill=tk.X, padx=2)

        ttk.Separator(right_frame, orient='horizontal').pack(fill=tk.X, pady=10)

        # 実行ボタン
        execute_frame = ttk.Frame(right_frame)
        execute_frame.pack(fill=tk.X)

        ttk.Button(execute_frame, text="モザイク処理して保存",
                  command=self.process_and_save,
                  style='Accent.TButton').pack(fill=tk.X, pady=2)
        ttk.Button(execute_frame, text="スキップ", command=self.skip_image).pack(fill=tk.X, pady=2)

        # ステータスバー
        self.status_label = ttk.Label(self.root, text="準備完了", relief=tk.SUNKEN)
        self.status_label.pack(side=tk.BOTTOM, fill=tk.X)

        # 使い方の説明
        help_text = """
使い方:
• 画像を開くと自動検出されます
• 左クリック＆ドラッグ: 範囲選択
• 矩形をドラッグ: 移動
• ハンドルをドラッグ: 拡大縮小
• 右クリック: 矩形を削除
• 自動検出ボタン: 再検出
• リストから選択: 領域をハイライト
        """
        ttk.Label(right_frame, text=help_text, justify=tk.LEFT,
                 foreground='gray').pack(pady=10)

    def load_detectors(self):
        """検出器の読み込み"""
        try:
            # 顔検出器
            self.face_cascade = cv2.CascadeClassifier(FACE_CASCADE_PATH)
            if self.face_cascade.empty():
                messagebox.showwarning("警告", "顔検出器を読み込めませんでした")
                self.face_cascade = None

            # OCRリーダー
            if USE_OCR:
                try:
                    import easyocr
                    self.status_label.config(text="OCRリーダーを初期化中...")
                    self.root.update()
                    self.ocr_reader = easyocr.Reader(
                        ["ja", "en"],
                        gpu=False,
                        verbose=False,
                    )
                    self.status_label.config(text="準備完了")
                except Exception as e:
                    messagebox.showwarning("警告", f"OCRリーダーの初期化に失敗: {e}")
                    self.ocr_reader = None
        except Exception as e:
            messagebox.showerror("エラー", f"検出器の読み込みに失敗: {e}")

    def load_image(self, index):
        """画像を読み込んで表示"""
        if index < 0 or index >= len(self.image_paths):
            return

        self.current_index = index
        img_path = self.image_paths[index]

        # 画像を読み込み
        self.original_img = cv2.imread(img_path)
        if self.original_img is None:
            messagebox.showerror("エラー", f"画像を読み込めませんでした: {img_path}")
            return

        # 矩形をクリア
        self.rectangles = []
        self.selected_rect = None

        # 表示を更新
        self.update_display()
        self.update_file_info()
        self.update_rect_list()

        self.status_label.config(text=f"画像を読み込みました: {os.path.basename(img_path)}")

        # 自動検出を実行
        self.auto_detect()

    def update_display(self):
        """画像とエクスカーテーションを表示"""
        if self.original_img is None:
            return

        # 画像をRGBに変換
        display_img = cv2.cvtColor(self.original_img.copy(), cv2.COLOR_BGR2RGB)
        h, w = display_img.shape[:2]

        # 表示サイズを計算
        scale_w = self.max_display_width / w
        scale_h = self.max_display_height / h
        self.scale = min(scale_w, scale_h, 1.0)

        new_w = int(w * self.scale)
        new_h = int(h * self.scale)

        # リサイズ
        display_img = cv2.resize(display_img, (new_w, new_h))

        # PILに変換
        self.display_img = Image.fromarray(display_img)
        self.photo = ImageTk.PhotoImage(self.display_img)

        # キャンバスに表示
        self.canvas.config(width=new_w, height=new_h)
        self.canvas.delete('all')
        self.canvas.create_image(0, 0, anchor=tk.NW, image=self.photo)

        # 矩形を描画
        self.draw_rectangles()

    def draw_rectangles(self):
        """矩形を描画"""
        for i, (x, y, w, h, rect_type, label) in enumerate(self.rectangles):
            # スケールを適用
            sx = int(x * self.scale)
            sy = int(y * self.scale)
            sw = int(w * self.scale)
            sh = int(h * self.scale)

            # 色を決定
            if rect_type == 'face':
                color = 'red'
            elif rect_type == 'text':
                color = 'blue'
            elif rect_type == 'date':
                color = 'green'
            else:  # manual
                color = 'yellow'

            # 選択中は太線
            width = 3 if i == self.selected_rect else 2

            self.canvas.create_rectangle(sx, sy, sx + sw, sy + sh,
                                        outline=color, width=width, tags=f'rect_{i}')

            # ラベルを表示
            if label:
                self.canvas.create_text(sx + 5, sy + 5, text=label, anchor=tk.NW,
                                      fill=color, font=('Arial', 10, 'bold'))

            # 選択中の矩形にはリサイズハンドルを表示
            if i == self.selected_rect:
                self.draw_resize_handles(sx, sy, sw, sh, color)

    def draw_resize_handles(self, sx, sy, sw, sh, color):
        """リサイズハンドルを描画"""
        handle_size = 8

        # 四隅のハンドル
        handles = [
            (sx, sy),  # 左上 (nw)
            (sx + sw, sy),  # 右上 (ne)
            (sx, sy + sh),  # 左下 (sw)
            (sx + sw, sy + sh),  # 右下 (se)
        ]

        for hx, hy in handles:
            self.canvas.create_rectangle(
                hx - handle_size // 2, hy - handle_size // 2,
                hx + handle_size // 2, hy + handle_size // 2,
                fill=color, outline='white', width=1, tags='handle'
            )

        # 辺の中央のハンドル
        edge_handles = [
            (sx + sw // 2, sy),  # 上 (n)
            (sx + sw // 2, sy + sh),  # 下 (s)
            (sx, sy + sh // 2),  # 左 (w)
            (sx + sw, sy + sh // 2),  # 右 (e)
        ]

        for hx, hy in edge_handles:
            self.canvas.create_rectangle(
                hx - handle_size // 2, hy - handle_size // 2,
                hx + handle_size // 2, hy + handle_size // 2,
                fill=color, outline='white', width=1, tags='handle'
            )

    def get_resize_handle(self, event_x, event_y):
        """マウス位置がリサイズハンドル上にあるか判定"""
        if self.selected_rect is None:
            return None

        x, y, w, h, _, _ = self.rectangles[self.selected_rect]
        sx = int(x * self.scale)
        sy = int(y * self.scale)
        sw = int(w * self.scale)
        sh = int(h * self.scale)

        handle_size = 8
        threshold = handle_size

        # 四隅のハンドル
        corners = [
            (sx, sy, 'nw'),
            (sx + sw, sy, 'ne'),
            (sx, sy + sh, 'sw'),
            (sx + sw, sy + sh, 'se'),
        ]

        for hx, hy, handle_type in corners:
            if abs(event_x - hx) <= threshold and abs(event_y - hy) <= threshold:
                return handle_type

        # 辺の中央のハンドル
        edges = [
            (sx + sw // 2, sy, 'n'),
            (sx + sw // 2, sy + sh, 's'),
            (sx, sy + sh // 2, 'w'),
            (sx + sw, sy + sh // 2, 'e'),
        ]

        for hx, hy, handle_type in edges:
            if abs(event_x - hx) <= threshold and abs(event_y - hy) <= threshold:
                return handle_type

        return None

    def auto_detect(self):
        """自動検出を実行"""
        if self.original_img is None:
            return

        self.status_label.config(text="自動検出中...")
        self.root.update()

        # 既存の矩形をクリア
        self.rectangles = []

        # 顔検出
        if self.face_cascade:
            faces = detect_faces(self.original_img, self.face_cascade)
            for x, y, w, h in faces:
                self.rectangles.append((x, y, w, h, 'face', '顔'))

        # テキスト・日付検出
        if self.ocr_reader:
            from main import detect_text_regions as detect_text
            name_regions, detected_names, date_regions, detected_dates = detect_text(
                self.original_img, self.ocr_reader
            )

            for (x, y, w, h), name in zip(name_regions, detected_names):
                self.rectangles.append((x, y, w, h, 'text', name))

            for (x, y, w, h), date in zip(date_regions, detected_dates):
                self.rectangles.append((x, y, w, h, 'date', date))

        self.update_display()
        self.update_rect_list()
        self.status_label.config(text=f"{len(self.rectangles)}件の領域を検出しました")

    def on_mouse_down(self, event):
        """マウスボタン押下"""
        # リサイズハンドルをクリックしたか確認
        handle = self.get_resize_handle(event.x, event.y)
        if handle:
            self.resizing = True
            self.resize_handle = handle
            x, y, w, h, rect_type, label = self.rectangles[self.selected_rect]
            self.resize_start_rect = (x, y, w, h)
            self.drag_start_x = event.x
            self.drag_start_y = event.y
            return

        # 既存の矩形をクリックしたか確認
        for i, (x, y, w, h, _, _) in enumerate(self.rectangles):
            sx = int(x * self.scale)
            sy = int(y * self.scale)
            sw = int(w * self.scale)
            sh = int(h * self.scale)

            if sx <= event.x <= sx + sw and sy <= event.y <= sy + sh:
                self.selected_rect = i
                self.dragging = True
                self.drag_start_x = event.x
                self.drag_start_y = event.y
                self.update_display()
                self.rect_listbox.selection_clear(0, tk.END)
                self.rect_listbox.selection_set(i)
                return

        # 新しい矩形を描画開始
        self.drawing = True
        self.start_x = event.x
        self.start_y = event.y
        self.selected_rect = None

    def on_mouse_move(self, event):
        """マウス移動"""
        if self.resizing and self.selected_rect is not None:
            # 矩形をリサイズ
            dx = (event.x - self.drag_start_x) / self.scale
            dy = (event.y - self.drag_start_y) / self.scale

            x, y, w, h = self.resize_start_rect
            _, _, _, _, rect_type, label = self.rectangles[self.selected_rect]

            # ハンドルの種類に応じてリサイズ
            if self.resize_handle == 'nw':  # 左上
                new_x = int(x + dx)
                new_y = int(y + dy)
                new_w = int(w - dx)
                new_h = int(h - dy)
            elif self.resize_handle == 'ne':  # 右上
                new_x = x
                new_y = int(y + dy)
                new_w = int(w + dx)
                new_h = int(h - dy)
            elif self.resize_handle == 'sw':  # 左下
                new_x = int(x + dx)
                new_y = y
                new_w = int(w - dx)
                new_h = int(h + dy)
            elif self.resize_handle == 'se':  # 右下
                new_x = x
                new_y = y
                new_w = int(w + dx)
                new_h = int(h + dy)
            elif self.resize_handle == 'n':  # 上
                new_x = x
                new_y = int(y + dy)
                new_w = w
                new_h = int(h - dy)
            elif self.resize_handle == 's':  # 下
                new_x = x
                new_y = y
                new_w = w
                new_h = int(h + dy)
            elif self.resize_handle == 'w':  # 左
                new_x = int(x + dx)
                new_y = y
                new_w = int(w - dx)
                new_h = h
            elif self.resize_handle == 'e':  # 右
                new_x = x
                new_y = y
                new_w = int(w + dx)
                new_h = h
            else:
                return

            # 最小サイズを確保
            if new_w < 10:
                new_w = 10
                if self.resize_handle in ['nw', 'w', 'sw']:
                    new_x = x + w - 10
            if new_h < 10:
                new_h = 10
                if self.resize_handle in ['nw', 'n', 'ne']:
                    new_y = y + h - 10

            self.rectangles[self.selected_rect] = (
                new_x, new_y, new_w, new_h, rect_type, label
            )
            self.update_display()

        elif self.dragging and self.selected_rect is not None:
            # 矩形を移動
            dx = (event.x - self.drag_start_x) / self.scale
            dy = (event.y - self.drag_start_y) / self.scale

            x, y, w, h, rect_type, label = self.rectangles[self.selected_rect]
            self.rectangles[self.selected_rect] = (
                int(x + dx), int(y + dy), w, h, rect_type, label
            )

            self.drag_start_x = event.x
            self.drag_start_y = event.y
            self.update_display()

        elif self.drawing:
            # 描画中の矩形を表示
            self.update_display()
            x1, y1 = self.start_x, self.start_y
            x2, y2 = event.x, event.y
            self.canvas.create_rectangle(x1, y1, x2, y2, outline='yellow', width=2)

    def on_mouse_up(self, event):
        """マウスボタンリリース"""
        if self.resizing:
            self.resizing = False
            self.resize_handle = None
            self.resize_start_rect = None
            return

        if self.dragging:
            self.dragging = False
            return

        if self.drawing:
            self.drawing = False

            # 矩形を追加
            x1 = int(min(self.start_x, event.x) / self.scale)
            y1 = int(min(self.start_y, event.y) / self.scale)
            x2 = int(max(self.start_x, event.x) / self.scale)
            y2 = int(max(self.start_y, event.y) / self.scale)

            w = x2 - x1
            h = y2 - y1

            if w > 10 and h > 10:  # 最小サイズ
                self.rectangles.append((x1, y1, w, h, 'manual', '手動'))
                self.update_display()
                self.update_rect_list()

    def on_mouse_motion(self, event):
        """マウスが動いた時（ボタンを押していない状態）"""
        # リサイズハンドル上にカーソルがある場合、カーソルを変更
        handle = self.get_resize_handle(event.x, event.y)
        if handle:
            # カーソルの形状を変更
            if handle in ['nw', 'se']:
                self.canvas.config(cursor='size_nw_se')
            elif handle in ['ne', 'sw']:
                self.canvas.config(cursor='size_ne_sw')
            elif handle in ['n', 's']:
                self.canvas.config(cursor='sb_v_double_arrow')
            elif handle in ['e', 'w']:
                self.canvas.config(cursor='sb_h_double_arrow')
        else:
            # デフォルトのカーソル
            self.canvas.config(cursor='cross')

    def on_right_click(self, event):
        """右クリック（削除）"""
        for i, (x, y, w, h, _, _) in enumerate(self.rectangles):
            sx = int(x * self.scale)
            sy = int(y * self.scale)
            sw = int(w * self.scale)
            sh = int(h * self.scale)

            if sx <= event.x <= sx + sw and sy <= event.y <= sy + sh:
                self.rectangles.pop(i)
                self.selected_rect = None
                self.update_display()
                self.update_rect_list()
                return

    def on_select_rect(self, event):
        """リストボックスから選択"""
        selection = self.rect_listbox.curselection()
        if selection:
            self.selected_rect = selection[0]
            self.update_display()

    def delete_selected(self):
        """選択中の矩形を削除"""
        if self.selected_rect is not None and 0 <= self.selected_rect < len(self.rectangles):
            self.rectangles.pop(self.selected_rect)
            self.selected_rect = None
            self.update_display()
            self.update_rect_list()

    def clear_all(self):
        """全ての矩形を削除"""
        if messagebox.askyesno("確認", "全ての検出領域を削除しますか？"):
            self.rectangles = []
            self.selected_rect = None
            self.update_display()
            self.update_rect_list()

    def update_file_info(self):
        """ファイル情報を更新"""
        if self.current_index < len(self.image_paths):
            path = self.image_paths[self.current_index]
            filename = os.path.basename(path)
            self.file_label.config(text=filename)
            self.progress_label.config(
                text=f"{self.current_index + 1} / {len(self.image_paths)}"
            )

    def update_rect_list(self):
        """矩形リストを更新"""
        self.rect_listbox.delete(0, tk.END)
        for i, (x, y, w, h, rect_type, label) in enumerate(self.rectangles):
            type_text = {'face': '顔', 'text': 'テキスト', 'date': '日付', 'manual': '手動'}
            text = f"{i+1}. {type_text.get(rect_type, '不明')}: {label or '(ラベルなし)'}"
            self.rect_listbox.insert(tk.END, text)

    def process_and_save(self):
        """モザイク処理して保存"""
        if self.original_img is None:
            return

        if not self.rectangles:
            if not messagebox.askyesno("確認", "検出領域がありません。元の画像をそのまま保存しますか？"):
                return

        # モザイク処理
        img = self.original_img.copy()
        for x, y, w, h, _, _ in self.rectangles:
            img = mosaic_region(img, x, y, w, h, add_margin=True, add_noise=True)

        # 保存
        img_path = self.image_paths[self.current_index]
        rel_path = os.path.relpath(img_path, self.root_dir)
        out_path = os.path.join(self.output_root, rel_path)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)

        strip_exif_and_save(img, out_path)

        self.status_label.config(text=f"保存しました: {os.path.basename(out_path)}")
        messagebox.showinfo("完了", "モザイク処理が完了しました")

        # 次の画像へ
        self.next_image()

    def skip_image(self):
        """スキップ"""
        self.next_image()

    def prev_image(self):
        """前の画像"""
        if self.current_index > 0:
            self.load_image(self.current_index - 1)

    def next_image(self):
        """次の画像"""
        if self.current_index < len(self.image_paths) - 1:
            self.load_image(self.current_index + 1)
        else:
            messagebox.showinfo("完了", "全ての画像の処理が完了しました")


def main():
    parser = argparse.ArgumentParser(description="モザイク処理エディタ（GUI版）")
    parser.add_argument(
        "target_dir",
        nargs="?",
        default=None,
        help="処理する画像があるディレクトリのパス"
    )
    parser.add_argument(
        "-o", "--output",
        dest="output_dir",
        default=None,
        help="出力先ディレクトリのパス"
    )

    args = parser.parse_args()

    # ディレクトリ選択
    root = tk.Tk()
    root.withdraw()

    if args.target_dir:
        target_dir = os.path.abspath(args.target_dir)
    else:
        target_dir = filedialog.askdirectory(title="画像があるディレクトリを選択")
        if not target_dir:
            messagebox.showinfo("キャンセル", "ディレクトリが選択されませんでした")
            return

    if not os.path.exists(target_dir):
        messagebox.showerror("エラー", f"ディレクトリが存在しません: {target_dir}")
        return

    # 出力先
    if args.output_dir:
        output_root = os.path.abspath(args.output_dir)
    else:
        output_root = os.path.join(target_dir, OUTPUT_DIRNAME)

    os.makedirs(output_root, exist_ok=True)

    # 画像ファイルを取得
    image_paths = list_images_recursively(target_dir)
    image_paths = [p for p in image_paths if not os.path.commonpath([p, output_root]) == output_root]

    if not image_paths:
        messagebox.showinfo("情報", "処理対象の画像が見つかりませんでした")
        return

    # GUIを起動
    root.deiconify()
    app = MosaicEditorApp(root, image_paths, output_root, target_dir)
    root.mainloop()


if __name__ == "__main__":
    main()
